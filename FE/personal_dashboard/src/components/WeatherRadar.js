import { useState } from "react";
import useIsMobile from "../hooks/useIsMobile";
import theme, { colors } from "../styles/theme";

const DEFAULT_LAT = 45.5152;
const DEFAULT_LON = -122.6784;

const layers = {
  radar: {
    label: "Radar",
    overlay: "radar"
  },
  satellite: {
    label: "Satellite",
    overlay: "satellite"
  },
  wind: {
    label: "Wind",
    overlay: "wind"
  },
  rain: {
    label: "Rain",
    overlay: "rain"
  },
  temperature: {
    label: "Temperature",
    overlay: "temp"
  }
};

export default function WeatherRadar({ lat = DEFAULT_LAT, lon = DEFAULT_LON }) {
  const [active, setActive] = useState("radar");
  const isMobile = useIsMobile();

  const selected = layers[active];

  const src = `https://embed.windy.com/embed2.html?lat=${lat}&lon=${lon}&zoom=8&level=surface&overlay=${selected.overlay}`;

  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <h2>Weather Center</h2>
        <div style={styles.tabs}>
          {Object.entries(layers).map(([key, layer]) => (
            <button
              key={key}
              onClick={() => setActive(key)}
              style={active === key ? styles.activeTab : styles.tab}
            >
              {layer.label}
            </button>
          ))}
        </div>
      </div>

      <iframe
        title={`Weather ${selected.label}`}
        src={src}
        width="100%"
        height={isMobile ? 350 : 600}
        frameBorder="0"
        style={styles.iframe}
      />
    </div>
  );
}

const styles = {
  card: {
    background: colors.surface,
    borderRadius: 16,
    padding: 20,
    color: colors.text,
    marginBottom: 20
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap"
  },
  tabs: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap"
  },
  tab: theme.tab,
  activeTab: theme.tabActive,
  iframe: {
    border: "none",
    borderRadius: 12,
    marginTop: 15
  }
};