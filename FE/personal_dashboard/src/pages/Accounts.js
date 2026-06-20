import { useAuth } from "../context/AuthContext";

export default function Accounts() {
  const { user, token } = useAuth();

  console.log("ACCOUNT USER:", user);
  console.log("ACCOUNT TOKEN:", token);
  if (!user) {
    return <div>No user loaded</div>;
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>👤 Account Info</h1>

      <div style={styles.box}>
        <p><strong>Username:</strong> {user.username}</p>
        <p><strong>Role:</strong> {user.role}</p>
        <p><strong>User ID:</strong> {user.id}</p>
      </div>

      <div style={styles.box}>
        <p><strong>JWT Token Preview:</strong></p>
        <code style={{ wordBreak: "break-all" }}>
          {token?.slice(0, 40)}...
        </code>
      </div>
    </div>
  );
}

const styles = {
  box: {
    marginTop: 20,
    padding: 15,
    background: "#f4f4f4",
    borderRadius: 8
  }
};