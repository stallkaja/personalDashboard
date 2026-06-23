import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";

import theme, { colors } from "../styles/theme";
import { API_URL } from "../config";

export default function ShoppingList() {
  const { token } = useAuth();

  const [items, setItems] = useState([]);
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [error, setError] = useState("");

  const loadItems = async () => {
    try {
      const res = await fetch(`${API_URL}/shopping`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const data = await res.json();
      setItems(data.items || []);
    } catch {
      setError("Failed to load shopping list.");
    }
  };

  useEffect(() => {
    if (token) loadItems();
  }, [token]);

  const addItem = async () => {
    setError("");

    if (!name) {
      setError("Item name is required.");
      return;
    }

    try {
      const res = await fetch(`${API_URL}/shopping`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ name, quantity: quantity || null })
      });

      if (!res.ok) {
        setError("Failed to add item.");
        return;
      }

      setName("");
      setQuantity("");
      loadItems();
    } catch {
      setError("Network error adding item.");
    }
  };

  const toggleItem = async (id) => {
    try {
      await fetch(`${API_URL}/shopping/${id}/toggle`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` }
      });
      loadItems();
    } catch {
      setError("Failed to update item.");
    }
  };

  const deleteItem = async (id) => {
    try {
      await fetch(`${API_URL}/shopping/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      loadItems();
    } catch {
      setError("Failed to delete item.");
    }
  };

  const clearChecked = async () => {
    try {
      await fetch(`${API_URL}/shopping/clear-checked`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      loadItems();
    } catch {
      setError("Failed to clear checked items.");
    }
  };

  const hasChecked = items.some((item) => item.is_checked);

  return (
    <div style={styles.page}>
      <h1>🛒 Shopping List</h1>

      {error && <div style={styles.error}>{error}</div>}

      <div style={styles.card}>
        <h2>Add Item</h2>

        <input
          style={styles.input}
          placeholder="Item name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addItem()}
        />

        <input
          style={styles.input}
          placeholder="Quantity (optional)"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addItem()}
        />

        <button style={styles.button} onClick={addItem}>
          Add Item
        </button>
      </div>

      <div style={styles.card}>
        <div style={styles.listHeader}>
          <h2>List</h2>

          {hasChecked && (
            <button style={styles.clearButton} onClick={clearChecked}>
              Clear Checked
            </button>
          )}
        </div>

        {items.length === 0 ? (
          <p>Your shopping list is empty.</p>
        ) : (
          items.map((item) => (
            <div key={item.id} style={styles.itemRow}>
              <label style={styles.itemLabel}>
                <input
                  type="checkbox"
                  checked={item.is_checked}
                  onChange={() => toggleItem(item.id)}
                />

                <span
                  style={{
                    marginLeft: 10,
                    textDecoration: item.is_checked ? "line-through" : "none",
                    opacity: item.is_checked ? 0.5 : 1
                  }}
                >
                  {item.name}
                  {item.quantity ? ` — ${item.quantity}` : ""}
                </span>
              </label>

              <button style={styles.deleteButton} onClick={() => deleteItem(item.id)}>
                Delete
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

const styles = {
  page: theme.page,
  card: theme.card,
  input: theme.input,
  button: theme.button,
  clearButton: {
    padding: "6px 12px",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    background: colors.border,
    color: colors.text
  },
  deleteButton: theme.deleteButton,
  error: theme.error,
  listHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center"
  },
  itemRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    borderTop: `1px solid ${colors.border}`,
    padding: "10px 0"
  },
  itemLabel: {
    display: "flex",
    alignItems: "center",
    cursor: "pointer"
  }
};
