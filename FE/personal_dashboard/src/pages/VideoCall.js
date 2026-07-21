import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { useAuth } from "../context/AuthContext";
import useIsMobile from "../hooks/useIsMobile";
import theme, { colors } from "../styles/theme";
import { API_URL } from "../config";

// Public STUN servers are enough for peers on the same network / simple NATs.
// Calls that must traverse strict/symmetric NATs also need a TURN server —
// add its {urls,username,credential} here once you have one.
const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" }
];

export default function VideoCall() {
  const { token, user } = useAuth();
  const isMobile = useIsMobile();

  const [room, setRoom] = useState("family");
  const [joined, setJoined] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [peers, setPeers] = useState({}); // sid -> { username, stream }

  const socketRef = useRef(null);
  const localStreamRef = useRef(null);
  const localVideoRef = useRef(null);
  const pcsRef = useRef({}); // sid -> RTCPeerConnection

  const upsertPeer = useCallback((sid, patch) => {
    setPeers((prev) => ({ ...prev, [sid]: { ...prev[sid], ...patch } }));
  }, []);

  const removePeer = useCallback((sid) => {
    const pc = pcsRef.current[sid];
    if (pc) {
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.close();
      delete pcsRef.current[sid];
    }
    setPeers((prev) => {
      const next = { ...prev };
      delete next[sid];
      return next;
    });
  }, []);

  const createPeer = useCallback((sid, username, initiator) => {
    const socket = socketRef.current;
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcsRef.current[sid] = pc;

    localStreamRef.current?.getTracks().forEach((track) => {
      pc.addTrack(track, localStreamRef.current);
    });

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit("video_signal", { to: sid, signal: { candidate: e.candidate } });
      }
    };

    pc.ontrack = (e) => {
      upsertPeer(sid, { username, stream: e.streams[0] });
    };

    pc.onconnectionstatechange = () => {
      if (["failed", "closed", "disconnected"].includes(pc.connectionState)) {
        // leave the tile; a rejoin will recreate it
      }
    };

    if (initiator) {
      pc.createOffer()
        .then((offer) => pc.setLocalDescription(offer))
        .then(() => socket.emit("video_signal", { to: sid, signal: pc.localDescription }))
        .catch((err) => console.error("offer error", err));
    }

    upsertPeer(sid, { username, stream: null });
    return pc;
  }, [upsertPeer]);

  const handleSignal = useCallback(async ({ from, username, signal }) => {
    if (!signal) return;
    let pc = pcsRef.current[from];

    try {
      if (signal.type === "offer") {
        if (!pc) pc = createPeer(from, username, false);
        await pc.setRemoteDescription(signal);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socketRef.current.emit("video_signal", { to: from, signal: pc.localDescription });
      } else if (signal.type === "answer") {
        if (pc) await pc.setRemoteDescription(signal);
      } else if (signal.candidate) {
        if (pc) await pc.addIceCandidate(signal.candidate);
      }
    } catch (err) {
      console.error("signal handling error", err);
    }
  }, [createPeer]);

  const join = async () => {
    if (!room.trim()) { setError("Enter a room name."); return; }
    setError("");
    setConnecting(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
    } catch (err) {
      setConnecting(false);
      setError("Could not access camera/microphone. Please grant permission and try again.");
      return;
    }

    const socket = io(API_URL, { auth: { token } });
    socketRef.current = socket;

    socket.on("connect_error", () => setError("Could not connect to the call server."));

    socket.on("video_peers", ({ peers: existing }) => {
      // We are the newcomer: initiate an offer to each existing peer.
      existing.forEach((p) => createPeer(p.sid, p.username, true));
    });

    socket.on("video_peer_joined", ({ sid, username }) => {
      // Someone joined after us; they will send us an offer, so just note them.
      upsertPeer(sid, { username, stream: null });
    });

    socket.on("video_signal", handleSignal);
    socket.on("video_peer_left", ({ sid }) => removePeer(sid));

    socket.emit("video_join", { room: room.trim() });

    setJoined(true);
    setConnecting(false);
  };

  const leave = useCallback(() => {
    const socket = socketRef.current;
    if (socket) {
      socket.emit("video_leave", { room: room.trim() });
      socket.disconnect();
      socketRef.current = null;
    }
    Object.keys(pcsRef.current).forEach((sid) => {
      pcsRef.current[sid].close();
      delete pcsRef.current[sid];
    });
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    setPeers({});
    setJoined(false);
    setMuted(false);
    setCameraOff(false);
  }, [room]);

  // Clean up on unmount.
  useEffect(() => () => { if (socketRef.current) leave(); }, [leave]);

  const toggleMute = () => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (track) { track.enabled = !track.enabled; setMuted(!track.enabled); }
  };

  const toggleCamera = () => {
    const track = localStreamRef.current?.getVideoTracks()[0];
    if (track) { track.enabled = !track.enabled; setCameraOff(!track.enabled); }
  };

  const remoteSids = Object.keys(peers);
  const tileCount = remoteSids.length + 1;
  const columns = isMobile ? (tileCount > 1 ? 2 : 1) : Math.min(3, Math.ceil(Math.sqrt(tileCount)));

  if (!joined) {
    return (
      <div style={theme.page}>
        <h1>📹 Video Call</h1>
        <p style={styles.muted}>
          Start or join a private call room. Share the room name with whoever you want to call —
          anyone on the family dashboard who joins the same room connects to the call.
        </p>

        <div style={{ ...theme.card, maxWidth: 460 }}>
          <label style={theme.label}>Room name</label>
          <input
            style={theme.input}
            value={room}
            onChange={(e) => setRoom(e.target.value)}
            placeholder="e.g. family, kitchen, grandma"
            onKeyDown={(e) => e.key === "Enter" && join()}
          />
          {error && <div style={theme.error}>{error}</div>}
          <button style={theme.button} onClick={join} disabled={connecting}>
            {connecting ? "Starting…" : "Join Call"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={theme.page}>
      <div style={styles.header}>
        <h1 style={{ margin: 0 }}>📹 {room}</h1>
        <span style={styles.muted}>{tileCount} in call</span>
      </div>

      {error && <div style={theme.error}>{error}</div>}

      <div style={{ ...styles.grid, gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
        <div style={styles.tile}>
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            style={{ ...styles.video, ...(cameraOff ? { visibility: "hidden" } : {}) }}
          />
          {cameraOff && <div style={styles.camoff}>Camera off</div>}
          <div style={styles.name}>{user?.username || "You"} (you){muted ? " · muted" : ""}</div>
        </div>

        {remoteSids.map((sid) => (
          <RemoteTile key={sid} peer={peers[sid]} />
        ))}
      </div>

      {remoteSids.length === 0 && (
        <p style={styles.waiting}>Waiting for others to join room “{room}”…</p>
      )}

      <div style={styles.controls}>
        <button style={styles.controlBtn} onClick={toggleMute}>
          {muted ? "🔇 Unmute" : "🎙️ Mute"}
        </button>
        <button style={styles.controlBtn} onClick={toggleCamera}>
          {cameraOff ? "📷 Camera on" : "📷 Camera off"}
        </button>
        <button style={styles.leaveBtn} onClick={leave}>Leave</button>
      </div>
    </div>
  );
}

function RemoteTile({ peer }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && peer.stream) ref.current.srcObject = peer.stream;
  }, [peer.stream]);

  return (
    <div style={styles.tile}>
      {peer.stream ? (
        <video ref={ref} autoPlay playsInline style={styles.video} />
      ) : (
        <div style={styles.connecting}>Connecting…</div>
      )}
      <div style={styles.name}>{peer.username || "Guest"}</div>
    </div>
  );
}

const styles = {
  muted: { opacity: 0.7, lineHeight: 1.5 },
  header: { display: "flex", alignItems: "baseline", gap: 12, marginBottom: 12 },
  grid: { display: "grid", gap: 12, marginBottom: 16 },
  tile: {
    position: "relative",
    background: "#000",
    borderRadius: 12,
    overflow: "hidden",
    aspectRatio: "4 / 3"
  },
  video: { width: "100%", height: "100%", objectFit: "cover", display: "block" },
  camoff: {
    position: "absolute", inset: 0, display: "flex", alignItems: "center",
    justifyContent: "center", color: colors.text, opacity: 0.6
  },
  connecting: {
    position: "absolute", inset: 0, display: "flex", alignItems: "center",
    justifyContent: "center", color: "#fff", opacity: 0.7
  },
  name: {
    position: "absolute", left: 8, bottom: 8,
    background: "rgba(0,0,0,0.55)", color: "#fff",
    fontSize: 12, padding: "3px 8px", borderRadius: 6
  },
  waiting: { opacity: 0.6, marginBottom: 16 },
  controls: { display: "flex", gap: 10, flexWrap: "wrap" },
  controlBtn: {
    padding: "10px 16px", borderRadius: 10, border: "none", cursor: "pointer",
    background: colors.border, color: colors.text, fontSize: 15
  },
  leaveBtn: {
    padding: "10px 16px", borderRadius: 10, border: "none", cursor: "pointer",
    background: colors.dangerSolid, color: colors.onSolid, fontSize: 15, fontWeight: "bold"
  }
};
