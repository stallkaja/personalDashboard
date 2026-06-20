import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import { useAuth } from "../context/AuthContext";
import WindCompass from "../components/WindCompass";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid
} from "recharts";

const API_URL = "http://192.168.1.72:8132";

function Card({ title, value }) {
  return (
    <div style={styles.card}>
      <div style={{ opacity: 0.7 }}>{title}</div>
      <div style={{ fontSize: 28, marginTop: 10 }}>{value}</div>
    </div>
  );
}

export default function Dashboard() {
  const { token } = useAuth();

  const [latest, setLatest] = useState(null);
  const [history, setHistory] = useState([]);
  const [selectedDay, setSelectedDay] = useState(null);
  const [todayStats, setTodayStats] = useState(null);
  const [dailyStats, setDailyStats] = useState([]);

  useEffect(() => {
    async function loadData() {
      try {
        const latestRes = await fetch(`${API_URL}/latest`);
        const latestJson = await latestRes.json();

        if (latestJson?.data) {
          setLatest(latestJson.data);
        }

        const historyRes = await fetch(`${API_URL}/history`);
        const historyJson = await historyRes.json();

        if (historyJson?.history) {
          setHistory(historyJson.history.reverse());
        }

        const statsRes = await fetch(`${API_URL}/stats/today`);
        const statsJson = await statsRes.json();

        if (statsJson?.stats) {
          setTodayStats(statsJson.stats);
        }

        const dailyRes = await fetch(`${API_URL}/stats/daily`);
        const dailyJson = await dailyRes.json();

        if (dailyJson?.daily) {
          setDailyStats(dailyJson.daily.reverse());
        }
      } catch (err) {
        console.error("Initial data load failed:", err);
      }
    }

    loadData();
  }, []);

  useEffect(() => {
    if (!token) return;

    const socket = io(API_URL, {
      auth: { token }
    });

    socket.on("connect", () => {
      console.log("Socket Connected");
    });

    socket.on("connect_error", (err) => {
      console.error("Socket connection error:", err.message);
    });

    socket.on("weather_update", (msg) => {
      if (!msg || !msg.data) return;

      setLatest({ ...msg.data });

      setHistory((prev) => [
        ...prev,
        {
          timestamp: msg.timestamp,
          tempf: parseFloat(msg.data.tempf || 0),
          humidity: parseFloat(msg.data.humidity || 0),
          windspeedmph: parseFloat(msg.data.windspeedmph || 0),
          windgustmph: parseFloat(msg.data.windgustmph || 0),
          winddir: parseFloat(msg.data.winddir || 0),
          uv: parseFloat(msg.data.uv || 0),
          baromrelin: parseFloat(msg.data.baromrelin || 0),
          dailyrainin: parseFloat(msg.data.dailyrainin || 0)
        }
      ]);
    });

    return () => socket.disconnect();
  }, [token]);

  if (!latest) {
    return <div style={{ padding: 40 }}>Loading weather data...</div>;
  }

  const temp = Math.round(parseFloat(latest.tempf || 0));
  const humidity = parseFloat(latest.humidity || 0);
  const wind = parseFloat(latest.windspeedmph || 0);
  const gust = parseFloat(latest.windgustmph || 0);
  const pressure = parseFloat(latest.baromrelin || 0);
  const uv = parseFloat(latest.uv || 0);
  const rain = parseFloat(latest.dailyrainin || 0);
  const windDir = parseFloat(latest.winddir || 0);

  const groupedHistory = history.reduce((acc, item) => {
    const day = new Date(item.timestamp).toDateString();
    if (!acc[day]) acc[day] = [];
    acc[day].push(item);
    return acc;
  }, {});

  const days = Object.keys(groupedHistory);

  const selectedHistory =
    selectedDay && groupedHistory[selectedDay]
      ? groupedHistory[selectedDay]
      : history;

  const selectedChartData = selectedHistory.map((r) => ({
    time: new Date(r.timestamp).toLocaleTimeString(),
    temp: parseFloat(r.tempf || 0),
    humidity: parseFloat(r.humidity || 0),
    wind: parseFloat(r.windspeedmph || 0),
    gust: parseFloat(r.windgustmph || 0),
    pressure: parseFloat(r.baromrelin || 0),
    rain: parseFloat(r.dailyrainin || 0)
  }));

  return (
    <div style={styles.page}>
      <h1>🌤 Weather Dashboard</h1>

      <div style={styles.heroGrid}>
        <WindCompass direction={windDir} speed={wind} gust={gust} />

        <div style={styles.currentPanel}>
          <div style={styles.bigTemp}>{temp}°</div>
          <div style={styles.currentText}>Humidity {humidity}%</div>
          <div style={styles.currentText}>Pressure {pressure} inHg</div>
          <div style={styles.currentText}>Rain Today {rain} in</div>
        </div>
      </div>

      <div style={styles.grid}>
        <Card title="Humidity" value={`${humidity}%`} />
        <Card title="Wind" value={`${wind} mph`} />
        <Card title="Wind Gust" value={`${gust} mph`} />
        <Card title="Pressure" value={`${pressure} inHg`} />
        <Card title="UV Index" value={uv} />
        <Card title="Rain Today" value={`${rain} in`} />
        <Card title="Wind Dir" value={`${windDir}°`} />
      </div>

      {todayStats && (
        <>
          <h2>Today's Stats</h2>
          <div style={styles.grid}>
            <Card title="High Temp" value={`${Number(todayStats.high_temp).toFixed(1)}°F`} />
            <Card title="Low Temp" value={`${Number(todayStats.low_temp).toFixed(1)}°F`} />
            <Card title="Avg Temp" value={`${Number(todayStats.avg_temp).toFixed(1)}°F`} />
            <Card title="Max Gust" value={`${Number(todayStats.max_gust).toFixed(1)} mph`} />
            <Card title="Rain Total" value={`${Number(todayStats.rain_total).toFixed(3)} in`} />
          </div>
        </>
      )}

      {dailyStats.length > 0 && (
        <div style={styles.chartBox}>
          <h2>7-Day Temperature Analytics</h2>

          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={dailyStats}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="high_temp" stroke="#ef4444" dot />
              <Line type="monotone" dataKey="low_temp" stroke="#38bdf8" dot />
              <Line type="monotone" dataKey="avg_temp" stroke="#facc15" dot />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div style={styles.historyHeader}>
        <h2>History</h2>

        <div style={styles.daySelector}>
          <button
            style={!selectedDay ? styles.dayButtonActive : styles.dayButton}
            onClick={() => setSelectedDay(null)}
          >
            All
          </button>

          {days.map((day) => (
            <button
              key={day}
              style={selectedDay === day ? styles.dayButtonActive : styles.dayButton}
              onClick={() => setSelectedDay(day)}
            >
              {day}
            </button>
          ))}
        </div>
      </div>

      <ChartBox title="Temperature History" data={selectedChartData} dataKey="temp" stroke="#ff7300" />
      <ChartBox title="Wind Speed History" data={selectedChartData} dataKey="wind" stroke="#00bfff" />
      <ChartBox title="Pressure History" data={selectedChartData} dataKey="pressure" stroke="#00ff88" />
      <ChartBox title="Rain History" data={selectedChartData} dataKey="rain" stroke="#a78bfa" />
    </div>
  );
}

function ChartBox({ title, data, dataKey, stroke }) {
  return (
    <div style={styles.chartBox}>
      <h2>{title}</h2>

      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="time" hide />
          <YAxis />
          <Tooltip />
          <Line type="monotone" dataKey={dataKey} stroke={stroke} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

const styles = {
  page: {
    padding: 20,
    background: "#0f172a",
    minHeight: "100vh",
    color: "white"
  },
  heroGrid: {
    display: "grid",
    gridTemplateColumns: "350px 1fr",
    gap: 20,
    marginBottom: 20
  },
  currentPanel: {
    background: "#1e293b",
    borderRadius: 12,
    padding: 20
  },
  bigTemp: {
    fontSize: 72,
    fontWeight: "bold",
    marginBottom: 20
  },
  currentText: {
    fontSize: 24,
    marginBottom: 8
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
    gap: 15,
    marginBottom: 30
  },
  card: {
    background: "#1f2937",
    color: "white",
    borderRadius: 12,
    padding: 20,
    textAlign: "center"
  },
  historyHeader: {
    marginBottom: 20
  },
  daySelector: {
    display: "flex",
    gap: 10,
    overflowX: "auto",
    marginBottom: 20
  },
  dayButton: {
    padding: "8px 12px",
    borderRadius: 8,
    border: "none",
    cursor: "pointer",
    background: "#334155",
    color: "white",
    whiteSpace: "nowrap"
  },
  dayButtonActive: {
    padding: "8px 12px",
    borderRadius: 8,
    border: "none",
    cursor: "pointer",
    background: "#38bdf8",
    color: "#0f172a",
    fontWeight: "bold",
    whiteSpace: "nowrap"
  },
  chartBox: {
    background: "#1e293b",
    padding: 20,
    borderRadius: 12,
    marginBottom: 20
  }
};