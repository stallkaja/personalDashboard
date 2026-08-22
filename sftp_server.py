"""Built-in SFTP server exposing admin-configured folders to Windows accounts.

Authentication is done entirely against real Windows accounts via the
Windows API (win32security.LogonUser) — there is no relationship between
this and the dashboard's own MySQL/JWT user system. Only Windows accounts
that are members of the local Administrators group may log in.

The SFTP root ("/") is a virtual filesystem: each row in the `sftp_shares`
MySQL table appears as one top-level named folder mapping to a real path on
disk. Clients cannot see or traverse anywhere else on the machine.

Started once, as a daemon thread, from listener.py (see
start_sftp_server_thread()) so it shares the lifecycle of the
Dashboard-Backend process/service — no separate Windows service is needed.
"""

import base64
import hashlib
import os
import socket
import stat as stat_module
import threading
import time

import paramiko
import pywintypes
import win32con
import win32net
import win32security

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SFTP_HOST_KEY_PATH = os.path.join(BASE_DIR, "sftp_host_key.pem")
SFTP_PORT = 2222
SFTP_BIND_ADDR = "0.0.0.0"
SFTP_BACKLOG = 10

# Well-known SID for the built-in local Administrators group. Comparing SIDs
# (rather than the group *name*) is locale-independent and can't be spoofed
# by a same-named local group.
_ADMINISTRATORS_SID = win32security.CreateWellKnownSid(win32security.WinBuiltinAdministratorsSid)

_status = {"running": False, "port": SFTP_PORT, "fingerprint": None}
_status_lock = threading.Lock()


# --- Windows authentication --------------------------------------------------

def _split_domain(username):
    """'DOMAIN\\user' -> ('DOMAIN', 'user'); bare 'user' -> ('.', 'user') so
    LogonUser checks the local account database (this feature is specifically
    for local Windows Administrators, not domain accounts)."""
    if "\\" in username:
        domain, user = username.split("\\", 1)
        return domain, user
    return ".", username


def _sids_equal(a, b):
    # pywin32 doesn't expose the Win32 EqualSid API directly; comparing the
    # canonical string form (e.g. "S-1-5-32-544") is the standard workaround.
    return win32security.ConvertSidToStringSid(a) == win32security.ConvertSidToStringSid(b)


def _is_windows_admin(token):
    """True iff the logon token's group list includes the well-known local
    Administrators SID."""
    groups = win32security.GetTokenInformation(token, win32security.TokenGroups)
    return any(_sids_equal(sid, _ADMINISTRATORS_SID) for sid, _attrs in groups)


def _authenticate_windows(username, password):
    """Validate credentials against real Windows accounts, then require
    Administrators membership. Never raises past this function — a bad
    username/password/locked account is a clean auth failure, not a crash."""
    domain, user = _split_domain(username)
    token = None
    try:
        token = win32security.LogonUser(
            user,
            domain,
            password,
            win32con.LOGON32_LOGON_NETWORK,   # no local profile load; correct for a file service
            win32con.LOGON32_PROVIDER_DEFAULT,
        )
        return _is_windows_admin(token)
    except pywintypes.error:
        return False
    finally:
        if token is not None:
            token.Close()


def _is_local_admin_by_name(username):
    """Passwordless check: is `username` currently a member of the local
    Administrators group? Used for public-key auth, where there is no
    password to LogonUser with — we trust the signature (paramiko already
    verified it cryptographically before check_auth_publickey is ever
    called; see its docstring) and independently confirm group membership
    by name via the local SAM, no credential involved."""
    domain, user = _split_domain(username)
    try:
        sid, _domain, _type = win32security.LookupAccountName(None, user)
    except pywintypes.error:
        return False
    try:
        members, _total, _resume = win32net.NetLocalGroupGetMembers(None, "Administrators", 0)
    except pywintypes.error:
        return False
    return any(_sids_equal(sid, m["sid"]) for m in members)


def _get_authorized_keys(username):
    """Public keys an admin has registered (via the dashboard's admin-gated
    UI) for this Windows username. Parsing failures for a stored row are
    skipped rather than raising, so one bad row can't break auth for
    everyone."""
    from listener import get_db

    db = get_db()
    cursor = db.cursor()
    cursor.execute(
        "SELECT public_key FROM sftp_authorized_keys WHERE windows_username=%s",
        (username,)
    )
    rows = cursor.fetchall()
    cursor.close()
    db.close()

    keys = []
    for (public_key_line,) in rows:
        try:
            keys.append(_parse_public_key_line(public_key_line))
        except (ValueError, IndexError):
            continue
    return keys


def _parse_public_key_line(line):
    """Parse an authorized_keys-style line ('ssh-rsa AAAA... comment') into
    a paramiko key object, the same wire format ssh-keygen produces."""
    parts = line.strip().split()
    if len(parts) < 2:
        raise ValueError("invalid public key line")
    key_type, b64blob = parts[0], parts[1]
    blob = base64.b64decode(b64blob)
    if key_type == "ssh-rsa":
        return paramiko.RSAKey(data=blob)
    if key_type == "ssh-ed25519":
        return paramiko.Ed25519Key(data=blob)
    if key_type.startswith("ecdsa-sha2-"):
        return paramiko.ECDSAKey(data=blob)
    raise ValueError(f"unsupported key type: {key_type}")


def _authorize_publickey(username, key):
    if not _is_local_admin_by_name(username):
        return False
    presented = key.asbytes()
    return any(stored.asbytes() == presented for stored in _get_authorized_keys(username))


class DashboardServerInterface(paramiko.ServerInterface):
    def check_auth_password(self, username, password):
        if _authenticate_windows(username, password):
            return paramiko.AUTH_SUCCESSFUL
        return paramiko.AUTH_FAILED

    def check_auth_publickey(self, username, key):
        # paramiko has already cryptographically verified the client holds
        # the private key for `key` by the time this is called with a real
        # attempt — our job is just "is this key authorized for this user".
        if _authorize_publickey(username, key):
            return paramiko.AUTH_SUCCESSFUL
        return paramiko.AUTH_FAILED

    def get_allowed_auths(self, username):
        return "password,publickey"

    def check_channel_request(self, kind, chanid):
        return paramiko.OPEN_SUCCEEDED


# --- Virtual multi-root filesystem ------------------------------------------

def _list_shares():
    """name -> real_path for every configured share. Re-queried per call
    (not cached) so admin UI add/remove is visible immediately; SFTP
    directory operations are infrequent enough for this to be cheap."""
    from listener import get_db  # local import: avoids a circular import at module load

    db = get_db()
    cursor = db.cursor()
    cursor.execute("SELECT name, real_path FROM sftp_shares")
    rows = cursor.fetchall()
    cursor.close()
    db.close()
    return {name: real_path for name, real_path in rows}


def _resolve_share_path(virtual_path):
    """Resolve a client-supplied path like '/Videos/sub/file.mp4' to a real
    filesystem path, enforcing that it cannot escape the share's real_path
    (same realpath+prefix check as listener.resolve_local_video_path,
    generalized to N roots).

    Returns (real_path, is_root). is_root=True means the synthetic virtual
    root ('/') — no real path backs it.

    Raises FileNotFoundError for an unknown share, PermissionError for a
    traversal attempt.
    """
    parts = [p for p in virtual_path.strip("/").split("/") if p not in ("", ".")]
    if not parts:
        return None, True

    share_name, sub_parts = parts[0], parts[1:]
    shares = _list_shares()
    if share_name not in shares:
        raise FileNotFoundError(virtual_path)

    base_dir = os.path.realpath(shares[share_name])
    candidate = os.path.realpath(os.path.join(base_dir, *sub_parts))

    if candidate != base_dir and not candidate.startswith(base_dir + os.sep):
        raise PermissionError(f"path escapes share: {virtual_path}")

    return candidate, False


def _root_attr():
    """Synthetic attributes for the virtual root and each share entry — looks
    like a directory; no single real inode backs it."""
    attr = paramiko.SFTPAttributes()
    attr.st_mode = stat_module.S_IFDIR | 0o755
    attr.st_size = 0
    attr.st_atime = attr.st_mtime = time.time()
    return attr


def _py_open_mode(flags):
    """os.O_* flags -> the fdopen() mode string, matching paramiko's own
    reference sftp server implementation."""
    if flags & os.O_WRONLY:
        return "ab" if flags & os.O_APPEND else "wb"
    if flags & os.O_RDWR:
        return "ab+" if flags & os.O_APPEND else "rb+"
    return "rb"


class DashboardSFTPHandle(paramiko.SFTPHandle):
    """Read/write is handled by the paramiko base class via
    self.readfile/self.writefile; only stat() needs overriding for accurate
    size/mtime on an open handle."""

    def stat(self):
        try:
            return paramiko.SFTPAttributes.from_stat(os.fstat(self.readfile.fileno()))
        except OSError as e:
            return paramiko.SFTPServer.convert_errno(e.errno)


class DashboardSFTPServerInterface(paramiko.SFTPServerInterface):
    def list_folder(self, path):
        try:
            real_path, is_root = _resolve_share_path(path)
        except (FileNotFoundError, PermissionError):
            return paramiko.SFTP_NO_SUCH_FILE

        if is_root:
            entries = []
            for name in _list_shares().keys():
                attr = _root_attr()
                attr.filename = name
                entries.append(attr)
            return entries

        try:
            out = []
            for entry in os.scandir(real_path):
                try:
                    attr = paramiko.SFTPAttributes.from_stat(entry.stat())
                    attr.filename = entry.name
                    out.append(attr)
                except OSError:
                    continue  # skip entries we can't stat rather than failing the whole listing
            return out
        except OSError as e:
            return paramiko.SFTPServer.convert_errno(e.errno)

    def stat(self, path):
        return self._stat_impl(path, follow_symlinks=True)

    def lstat(self, path):
        return self._stat_impl(path, follow_symlinks=False)

    def _stat_impl(self, path, follow_symlinks):
        try:
            real_path, is_root = _resolve_share_path(path)
        except FileNotFoundError:
            return paramiko.SFTP_NO_SUCH_FILE
        except PermissionError:
            return paramiko.SFTP_PERMISSION_DENIED

        if is_root:
            return _root_attr()

        try:
            st = os.stat(real_path) if follow_symlinks else os.lstat(real_path)
            return paramiko.SFTPAttributes.from_stat(st)
        except OSError as e:
            return paramiko.SFTPServer.convert_errno(e.errno)

    def open(self, path, flags, attr):
        try:
            real_path, is_root = _resolve_share_path(path)
        except FileNotFoundError:
            return paramiko.SFTP_NO_SUCH_FILE
        except PermissionError:
            return paramiko.SFTP_PERMISSION_DENIED
        if is_root:
            return paramiko.SFTP_PERMISSION_DENIED  # can't open() the virtual root as a file

        try:
            binary_flag = getattr(os, "O_BINARY", 0)  # required on Windows or transfers get CRLF-mangled
            fd = os.open(real_path, flags | binary_flag, 0o644)
            f = os.fdopen(fd, _py_open_mode(flags))
        except OSError as e:
            return paramiko.SFTPServer.convert_errno(e.errno)

        handle = DashboardSFTPHandle(flags)
        handle.readfile = f
        handle.writefile = f
        return handle

    def remove(self, path):
        return self._mutate(path, os.remove)

    def mkdir(self, path, attr):
        return self._mutate(path, os.mkdir)

    def rmdir(self, path):
        return self._mutate(path, os.rmdir)

    def rename(self, oldpath, newpath):
        return self._do_rename(oldpath, newpath)

    def posix_rename(self, oldpath, newpath):
        return self._do_rename(oldpath, newpath)

    def _do_rename(self, oldpath, newpath):
        try:
            old_real, old_is_root = _resolve_share_path(oldpath)
            new_real, new_is_root = _resolve_share_path(newpath)
        except FileNotFoundError:
            return paramiko.SFTP_NO_SUCH_FILE
        except PermissionError:
            return paramiko.SFTP_PERMISSION_DENIED

        if old_is_root or new_is_root:
            return paramiko.SFTP_PERMISSION_DENIED  # can't rename the share itself via SFTP

        old_share = oldpath.strip("/").split("/", 1)[0]
        new_share = newpath.strip("/").split("/", 1)[0]
        if old_share != new_share:
            return paramiko.SFTP_OP_UNSUPPORTED  # no cross-share moves

        try:
            os.rename(old_real, new_real)
            return paramiko.SFTP_OK
        except OSError as e:
            return paramiko.SFTPServer.convert_errno(e.errno)

    def _mutate(self, path, fn):
        try:
            real_path, is_root = _resolve_share_path(path)
        except FileNotFoundError:
            return paramiko.SFTP_NO_SUCH_FILE
        except PermissionError:
            return paramiko.SFTP_PERMISSION_DENIED
        if is_root:
            return paramiko.SFTP_PERMISSION_DENIED
        try:
            fn(real_path)
            return paramiko.SFTP_OK
        except OSError as e:
            return paramiko.SFTPServer.convert_errno(e.errno)


# --- Host key + accept loop --------------------------------------------------

def _load_or_generate_host_key():
    if os.path.exists(SFTP_HOST_KEY_PATH):
        return paramiko.RSAKey.from_private_key_file(SFTP_HOST_KEY_PATH)
    key = paramiko.RSAKey.generate(bits=3072)
    key.write_private_key_file(SFTP_HOST_KEY_PATH)
    return key


def _fingerprint(key):
    digest = hashlib.sha256(key.asbytes()).digest()
    return "SHA256:" + base64.b64encode(digest).decode().rstrip("=")


def _handle_client(client_sock, host_key):
    transport = paramiko.Transport(client_sock)
    transport.add_server_key(host_key)
    transport.set_subsystem_handler("sftp", paramiko.SFTPServer, DashboardSFTPServerInterface)

    server = DashboardServerInterface()
    try:
        transport.start_server(server=server)
    except (paramiko.SSHException, EOFError):
        transport.close()
        return

    channel = transport.accept(20)  # 20s handshake timeout
    if channel is None:
        transport.close()
        return

    # paramiko services the sftp subsystem on its own thread once the channel
    # opens; just block here until the session ends.
    while transport.is_active():
        time.sleep(1)
    transport.close()


def _accept_loop():
    host_key = _load_or_generate_host_key()

    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.bind((SFTP_BIND_ADDR, SFTP_PORT))
    sock.listen(SFTP_BACKLOG)

    with _status_lock:
        _status.update(running=True, port=SFTP_PORT, fingerprint=_fingerprint(host_key))

    print(f"[sftp] listening on {SFTP_BIND_ADDR}:{SFTP_PORT}")

    while True:
        try:
            client_sock, _addr = sock.accept()
        except OSError:
            with _status_lock:
                _status["running"] = False
            return
        threading.Thread(target=_handle_client, args=(client_sock, host_key), daemon=True).start()


def start_sftp_server_thread():
    threading.Thread(target=_accept_loop, daemon=True).start()


def get_sftp_status():
    with _status_lock:
        return dict(_status)
