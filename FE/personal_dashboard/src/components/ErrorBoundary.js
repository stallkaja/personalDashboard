import { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    this.setState({ info });
    console.error("App crashed:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 20, background: "#0f172a", color: "white", minHeight: "100vh" }}>
          <h1>Something went wrong</h1>
          <p style={{ color: "#fca5a5" }}>{String(this.state.error?.message || this.state.error)}</p>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, opacity: 0.8 }}>
            {this.state.error?.stack}
          </pre>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, opacity: 0.6 }}>
            {this.state.info?.componentStack}
          </pre>
        </div>
      );
    }

    return this.props.children;
  }
}
