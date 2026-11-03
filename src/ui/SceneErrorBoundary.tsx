import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { message: string | null };

/**
 * Keeps the panels and calculations usable if the 3D scene fails (a texture that cannot load,
 * a GPU without WebGL2). React only supports error boundaries as class components.
 */
export class SceneErrorBoundary extends Component<Props, State> {
  state: State = { message: null };

  static getDerivedStateFromError(error: unknown): State {
    return { message: error instanceof Error ? error.message : 'Unknown error' };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    // Surfaced in the UI below; the component stack helps when reading the browser console.
    console.error('3D scene failed', error, info.componentStack);
  }

  render() {
    if (this.state.message === null) return this.props.children;
    return (
      <div className="scene-error" role="alert">
        <p>The 3D view could not start: {this.state.message}</p>
        <p className="muted">Site data, charts and timelines below still work.</p>
        <button type="button" className="ghost-button" onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    );
  }
}
