import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
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

export default function ForecastDay() {
  const navigate = useNavigate();
  const { date } = useParams();

  const [dailyPeriods, setDailyPeriods] = useState([]);
  const [hourly, setHourly] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");

      try {
        const [dailyRes, hourlyRes] = await Promise.all([
          fetch(`${API_URL}/forecast`),
          fetch(`${API_URL}/forecast/hourly?date=${date}`)
        ]);

        const dailyJson = await dailyRes.json();
        const hourlyJson = await hourlyRes.json();

        const matchingDaily = (dailyJson.periods || []).filter(
          (p) => p.start_time && p.start_time.slice(0, 10) === date
        );

        setDailyPeriods(matchingDaily);
        setHourly(hourlyJson.periods || []);
      } catch {
        setError("Failed to load forecast for this day.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [date]);

  const dateLabel = new Date(`${date}T00:00:00`).toLocaleDateString("default", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  });

  const chartData = hourly.map((h) => ({
    time: new Date(h.start_time).toLocaleTimeString([], { hour: "numeric" }),
    temp: h.temperature,
    rain: h.probability_of_precipitation
  }));

  return (
    <div style={theme.page}>
      <button style={styles.backButton} onClick={() => navigate("/weather-center")}>
        ‹ Back to Weather Center
      </button>

      <h1>📅 {dateLabel}</h1>

      {error && <div style={theme.error}>{error}</div>}

      {loading ? (
        <div style={styles.loading}>Loading forecast...</div>
      ) : (
        <>
          {dailyPeriods.length > 0 && (
            <div style={theme.card}>
              <h2>Overview</h2>

              <div style={styles.dailyRow}>
                {dailyPeriods.map((period, index) => (
                  <div key={index} style={styles.dailyCard}>
                    <div style={styles.dailyName}>{period.name}</div>

                    {period.icon && (
                      <img src={period.icon} alt={period.short_forecast} style={styles.dailyIcon} />
                    )}

                    <div style={styles.dailyTemp}>
                      {period.temperature}°{period.temperature_unit}
                    </div>

                    <div style={styles.dailyShort}>{period.short_forecast}</div>
                    <div style={styles.dailyDetail}>{period.detailed_forecast}</div>

                    <div style={styles.dailyMeta}>
                      Wind {period.wind_speed} {period.wind_direction}
                      {period.probability_of_precipitation != null &&
                        period.probability_of_precipitation > 0 &&
                        ` · 💧 ${period.probability_of_precipitation}%`}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {chartData.length > 0 && (
            <div style={theme.card}>
              <h2>Hourly Temperature</h2>

              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" minTickGap={30} />
                  <YAxis />
                  <Tooltip formatter={(value) => `${value}°`} />
                  <Line type="monotone" dataKey="temp" stroke={colors.primary} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {hourly.length > 0 && (
            <div style={theme.card}>
              <h2>Hour by Hour</h2>

              <div style={styles.tableWrap}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}></th>
                      <th style={styles.th}>Time</th>
                      <th style={styles.th}>Temp</th>
                      <th style={styles.th}>Conditions</th>
                      <th style={styles.th}>Rain</th>
                      <th style={styles.th}>Wind</th>
                    </tr>
                  </thead>

                  <tbody>
                    {hourly.map((h, index) => (
                      <tr key={index}>
                        <td style={styles.td}>
                          {h.icon && (
                            <img src={h.icon} alt={h.short_forecast} style={styles.hourlyIcon} />
                          )}
                        </td>
                        <td style={styles.td}>
                          {new Date(h.start_time).toLocaleTimeString([], { hour: "numeric" })}
                        </td>
                        <td style={styles.td}>{h.temperature}°</td>
                        <td style={styles.td}>{h.short_forecast}</td>
                        <td style={styles.td}>
                          {h.probability_of_precipitation != null && h.probability_of_precipitation > 0
                            ? `💧 ${h.probability_of_precipitation}%`
                            : "—"}
                        </td>
                        <td style={styles.td}>{h.wind_speed}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {dailyPeriods.length === 0 && hourly.length === 0 && (
            <div style={theme.card}>
              <p>No forecast data available for this day. NWS forecasts only cover about 7 days out.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const styles = {
  backButton: {
    padding: "8px 14px",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    background: colors.border,
    color: colors.text,
    marginBottom: 16
  },
  loading: {
    padding: 40,
    textAlign: "center",
    opacity: 0.7
  },
  dailyRow: {
    display: "flex",
    gap: 16,
    flexWrap: "wrap"
  },
  dailyCard: {
    background: colors.surfaceAlt,
    borderRadius: 12,
    padding: 16,
    flex: "1 1 260px"
  },
  dailyName: {
    fontWeight: "bold",
    marginBottom: 8
  },
  dailyIcon: {
    width: 60,
    height: 60
  },
  dailyTemp: {
    fontSize: 28,
    fontWeight: "bold",
    marginTop: 6
  },
  dailyShort: {
    opacity: 0.85,
    marginTop: 4
  },
  dailyDetail: {
    fontSize: 13,
    opacity: 0.7,
    marginTop: 8,
    lineHeight: 1.4
  },
  dailyMeta: {
    fontSize: 12,
    opacity: 0.6,
    marginTop: 10
  },
  hourlyIcon: {
    width: 28,
    height: 28,
    display: "block"
  },
  tableWrap: {
    overflowX: "auto"
  },
  table: {
    width: "100%",
    borderCollapse: "collapse"
  },
  th: {
    textAlign: "left",
    borderBottom: `1px solid ${colors.borderStrong}`,
    padding: "8px 10px",
    fontSize: 13,
    opacity: 0.7,
    whiteSpace: "nowrap"
  },
  td: {
    borderBottom: `1px solid ${colors.border}`,
    padding: "8px 10px",
    whiteSpace: "nowrap"
  }
};
