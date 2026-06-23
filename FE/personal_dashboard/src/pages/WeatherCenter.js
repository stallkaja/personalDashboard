import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { io } from "socket.io-client";
import { useAuth } from "../context/AuthContext";
import useIsMobile from "../hooks/useIsMobile";

import WindCompass from "../components/WindCompass";
import CurrentConditions from "../components/CurrentConditions";
import WeatherRadar from "../components/WeatherRadar";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid
} from "recharts";

import theme, { colors } from "../styles/theme";
import { API_URL } from "../config";

const MAX_LIVE_POINTS = 1000;

const RANGES = [
  { label: "24 Hours", hours: 24 },
  { label: "3 Days", hours: 72 },
  { label: "7 Days", hours: 168 },
  { label: "30 Days", hours: 720 }
];

const METRICS = [
  { key: "temp", label: "Temperature", stroke: "#ff7300", suffix: "°F" },
  { key: "humidity", label: "Humidity", stroke: colors.primary, suffix: "%" },
  { key: "wind", label: "Wind Speed", stroke: "#00bfff", suffix: " mph" },
  { key: "gust", label: "Wind Gust", stroke: "#f472b6", suffix: " mph" },
  { key: "pressure", label: "Pressure", stroke: "#00ff88", suffix: " inHg" },
  { key: "rain", label: "Rain", stroke: "#a78bfa", suffix: " in" },
  { key: "solar", label: "Solar Radiation", stroke: "#facc15", suffix: " W/m²" }
];

function Card({ title, value }) {
  return (
    <div style={styles.card}>
      <div style={{ opacity: 0.7 }}>{title}</div>
      <div style={{ fontSize: 28, marginTop: 10 }}>{value}</div>
    </div>
  );
}

export default function WeatherCenter() {
  const { token } = useAuth();
  const isMobile = useIsMobile();
  const navigate = useNavigate();

  const [latest, setLatest] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [rangeHours, setRangeHours] = useState(RANGES[0].hours);
  const [activeMetric, setActiveMetric] = useState(METRICS[0].key);
  const [todayStats, setTodayStats] = useState(null);
  const [dailyStats, setDailyStats] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [records, setRecords] = useState(null);
  const [appSettings, setAppSettings] = useState(null);
  const [forecast, setForecast] = useState(null);

  const loadHistory = useCallback(async (hours) => {
    setHistoryLoading(true);

    try {
      const res = await fetch(`${API_URL}/history?hours=${hours}`);
      const json = await res.json();

      if (json?.history) {
        setHistory(json.history);
      }
    } catch (err) {
      console.error("Failed to load weather history:", err);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    async function loadWeatherCenterData() {
      try {
        const latestRes = await fetch(`${API_URL}/latest`);
        const latestJson = await latestRes.json();

        if (latestJson?.data) {
          setLatest(latestJson.data);
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

        const alertsRes = await fetch(`${API_URL}/alerts/current`);
        const alertsJson = await alertsRes.json();

        if (alertsJson?.alerts) {
          setAlerts(alertsJson.alerts);
        }

        const forecastRes = await fetch(`${API_URL}/forecast`);
        const forecastJson = await forecastRes.json();

        if (forecastJson?.periods) {
          setForecast(forecastJson.periods);
        }
      } catch (err) {
        console.error("Failed to load Weather Center data:", err);
      }
    }

    loadWeatherCenterData();
  }, []);

  useEffect(() => {
    if (!token) return;

    fetch(`${API_URL}/stats/records`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((res) => res.json())
      .then((data) => setRecords(data))
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    loadHistory(rangeHours);
  }, [rangeHours, loadHistory]);

  useEffect(() => {
    if (!token) return;

    fetch(`${API_URL}/settings/app`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((res) => res.json())
      .then((data) => setAppSettings(data))
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    if (!token) return;

    const socket = io(API_URL, {
      auth: { token }
    });

    socket.on("weather_update", (msg) => {
      if (!msg || !msg.data) return;

      setLatest({ ...msg.data });

      setHistory((prev) => {
        const next = [
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
            dailyrainin: parseFloat(msg.data.dailyrainin || 0),
            solarradiation: parseFloat(msg.data.solarradiation || 0)
          }
        ];

        return next.length > MAX_LIVE_POINTS
          ? next.slice(next.length - MAX_LIVE_POINTS)
          : next;
      });
    });

    return () => socket.disconnect();
  }, [token]);

  const chartData = useMemo(() => {
    return history.map((r) => ({
      time: new Date(r.timestamp).toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
      }),
      temp: r.tempf,
      humidity: r.humidity,
      wind: r.windspeedmph,
      gust: r.windgustmph,
      pressure: r.baromrelin,
      rain: r.dailyrainin,
      solar: r.solarradiation
    }));
  }, [history]);

  if (!latest) {
    return <div style={styles.loading}>Loading weather center...</div>;
  }

  const temp = parseFloat(latest.tempf || 0);
  const humidity = parseFloat(latest.humidity || 0);
  const wind = parseFloat(latest.windspeedmph || 0);
  const gust = parseFloat(latest.windgustmph || 0);
  const pressure = parseFloat(latest.baromrelin || 0);
  const uv = parseFloat(latest.uv || 0);
  const rain = parseFloat(latest.dailyrainin || 0);
  const windDir = parseFloat(latest.winddir || 0);
  const solar = parseFloat(latest.solarradiation || 0);
  const dewPoint = parseFloat(latest.dewpoint ?? temp);
  const feelsLike = parseFloat(latest.feels_like ?? temp);

  const activeMetricInfo = METRICS.find((m) => m.key === activeMetric);

  return (
    <div style={{ ...styles.page, padding: isMobile ? 12 : 20 }}>
      <h1>🌎 Weather Center</h1>

      {alerts.length > 0 && (
        <div style={styles.alertBox}>
          <h2>⚠️ Weather Alerts</h2>

          {alerts.map((alert, index) => (
            <div key={index} style={styles.alertItem}>
              <strong>{alert.type.toUpperCase()}:</strong> {alert.message}
            </div>
          ))}
        </div>
      )}

      <div style={{ ...styles.heroGrid, gridTemplateColumns: isMobile ? "1fr" : "2fr 1fr" }}>
        <CurrentConditions
          temp={temp}
          feelsLike={feelsLike}
          dewPoint={dewPoint}
          humidity={humidity}
          wind={wind}
          gust={gust}
          pressure={pressure}
          uv={uv}
          rain={rain}
          solar={solar}
        />

        <WindCompass
          direction={windDir}
          speed={wind}
          gust={gust}
        />
      </div>

      {forecast && forecast.length > 0 && (
        <div style={styles.chartBox}>
          <h2>📅 Forecast</h2>

          <div style={styles.forecastRow}>
            {forecast.slice(0, 8).map((period, index) => (
              <div
                key={index}
                style={styles.forecastCard}
                onClick={() => navigate(`/forecast/${period.start_time.slice(0, 10)}`)}
              >
                <div style={styles.forecastName}>{period.name}</div>

                {period.icon && (
                  <img src={period.icon} alt={period.short_forecast} style={styles.forecastIcon} />
                )}

                <div style={styles.forecastTemp}>
                  {period.temperature}°{period.temperature_unit}
                </div>

                <div style={styles.forecastShort}>{period.short_forecast}</div>

                {period.probability_of_precipitation != null && period.probability_of_precipitation > 0 && (
                  <div style={styles.forecastRain}>💧 {period.probability_of_precipitation}%</div>
                )}

                <div style={styles.forecastWind}>
                  Wind {period.wind_speed} {period.wind_direction}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <WeatherRadar lat={appSettings?.station_lat} lon={appSettings?.station_lon} />

      {todayStats && (
        <>
          <h2>Today's Stats</h2>

          <div style={styles.grid}>
            <Card title="High Temp" value={`${Number(todayStats.high_temp).toFixed(1)}°F`} />
            <Card title="Low Temp" value={`${Number(todayStats.low_temp).toFixed(1)}°F`} />
            <Card title="Avg Temp" value={`${Number(todayStats.avg_temp).toFixed(1)}°F`} />
            <Card title="Max Gust" value={`${Number(todayStats.max_gust).toFixed(1)} mph`} />
            <Card title="Rain Total" value={`${Number(todayStats.rain_total).toFixed(3)} in`} />
            {todayStats.max_solar != null && (
              <Card title="Max Solar" value={`${Number(todayStats.max_solar).toFixed(0)} W/m²`} />
            )}
            {todayStats.high_humidity != null && (
              <Card
                title="Humidity Range"
                value={`${Number(todayStats.low_humidity).toFixed(0)}–${Number(todayStats.high_humidity).toFixed(0)}%`}
              />
            )}
          </div>
        </>
      )}

      {records && (
        <div style={styles.chartBox}>
          <h2>📊 All-Time Records</h2>

          <div style={styles.grid}>
            {records.hottest && (
              <Card
                title="Hottest Reading"
                value={`${records.hottest.value.toFixed(1)}°F`}
              />
            )}
            {records.coldest && (
              <Card
                title="Coldest Reading"
                value={`${records.coldest.value.toFixed(1)}°F`}
              />
            )}
            {records.windiest_gust && (
              <Card
                title="Windiest Gust"
                value={`${records.windiest_gust.value.toFixed(1)} mph`}
              />
            )}
            {records.rainiest_day && (
              <Card
                title="Rainiest Day"
                value={`${records.rainiest_day.value.toFixed(2)} in`}
              />
            )}
            {records.this_month_avg_temp != null && records.last_month_avg_temp != null && (
              <Card
                title="Month vs Last Month"
                value={`${records.this_month_avg_temp.toFixed(1)}° vs ${records.last_month_avg_temp.toFixed(1)}°`}
              />
            )}
          </div>
        </div>
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
              <Line type="monotone" dataKey="low_temp" stroke={colors.primary} dot />
              <Line type="monotone" dataKey="avg_temp" stroke="#facc15" dot />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div style={styles.historyHeader}>
        <h2>History</h2>

        <div style={styles.rangeSelector}>
          {RANGES.map((range) => (
            <button
              key={range.hours}
              style={rangeHours === range.hours ? styles.dayButtonActive : styles.dayButton}
              onClick={() => setRangeHours(range.hours)}
            >
              {range.label}
            </button>
          ))}
        </div>

        <div style={styles.metricSelector}>
          {METRICS.map((metric) => (
            <button
              key={metric.key}
              style={activeMetric === metric.key ? styles.metricButtonActive : styles.metricButton}
              onClick={() => setActiveMetric(metric.key)}
            >
              {metric.label}
            </button>
          ))}
        </div>
      </div>

      <div style={styles.chartBox}>
        <h2>{activeMetricInfo.label} History</h2>

        {historyLoading ? (
          <div style={styles.chartLoading}>Loading history...</div>
        ) : (
          <ResponsiveContainer width="100%" height={350}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" minTickGap={40} />
              <YAxis />
              <Tooltip formatter={(value) => `${Number(value).toFixed(1)}${activeMetricInfo.suffix}`} />
              <Line
                type="monotone"
                dataKey={activeMetricInfo.key}
                stroke={activeMetricInfo.stroke}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

const styles = {
  page: theme.page,
  loading: theme.loading,
  alertBox: {
    background: colors.danger,
    border: "1px solid #ef4444",
    borderRadius: 12,
    padding: 20,
    marginBottom: 20
  },
  alertItem: {
    background: colors.dangerStrong,
    borderRadius: 8,
    padding: 12,
    marginTop: 10
  },
  heroGrid: {
    display: "grid",
    gridTemplateColumns: "2fr 1fr",
    gap: 20,
    marginBottom: 30
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
    gap: 15,
    marginBottom: 30
  },
  card: {
    background: colors.surfaceAlt,
    color: colors.text,
    borderRadius: 12,
    padding: 20,
    textAlign: "center"
  },
  historyHeader: {
    marginBottom: 20
  },
  rangeSelector: {
    display: "flex",
    gap: 10,
    overflowX: "auto",
    marginBottom: 12
  },
  metricSelector: {
    display: "flex",
    gap: 10,
    overflowX: "auto",
    flexWrap: "wrap"
  },
  dayButton: {
    padding: "8px 12px",
    borderRadius: 8,
    border: "none",
    cursor: "pointer",
    background: colors.border,
    color: colors.text,
    whiteSpace: "nowrap"
  },
  dayButtonActive: {
    padding: "8px 12px",
    borderRadius: 8,
    border: "none",
    cursor: "pointer",
    background: colors.primary,
    color: colors.background,
    fontWeight: "bold",
    whiteSpace: "nowrap"
  },
  metricButton: {
    padding: "6px 12px",
    borderRadius: 999,
    border: `1px solid ${colors.border}`,
    cursor: "pointer",
    background: "transparent",
    color: colors.text,
    whiteSpace: "nowrap",
    fontSize: 13
  },
  metricButtonActive: {
    padding: "6px 12px",
    borderRadius: 999,
    border: `1px solid ${colors.primary}`,
    cursor: "pointer",
    background: colors.primary,
    color: colors.background,
    fontWeight: "bold",
    whiteSpace: "nowrap",
    fontSize: 13
  },
  chartBox: {
    background: colors.surface,
    padding: 20,
    borderRadius: 12,
    marginBottom: 20
  },
  forecastRow: {
    display: "flex",
    gap: 12,
    overflowX: "auto",
    paddingBottom: 8
  },
  forecastCard: {
    background: colors.surfaceAlt,
    borderRadius: 12,
    padding: 14,
    minWidth: 130,
    flexShrink: 0,
    textAlign: "center",
    cursor: "pointer",
    border: `1px solid ${colors.border}`
  },
  forecastName: {
    fontSize: 13,
    fontWeight: "bold",
    marginBottom: 8,
    opacity: 0.85
  },
  forecastIcon: {
    width: 50,
    height: 50,
    margin: "0 auto"
  },
  forecastTemp: {
    fontSize: 22,
    fontWeight: "bold",
    marginTop: 6
  },
  forecastShort: {
    fontSize: 12,
    opacity: 0.8,
    marginTop: 4,
    minHeight: 32
  },
  forecastRain: {
    fontSize: 12,
    color: colors.primary,
    marginTop: 4
  },
  forecastWind: {
    fontSize: 11,
    opacity: 0.6,
    marginTop: 6
  },
  chartLoading: {
    padding: 60,
    textAlign: "center",
    opacity: 0.7
  }
};
