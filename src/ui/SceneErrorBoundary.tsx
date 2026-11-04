import { Component, type ErrorInfo, type ReactNode } from 'react';
import { translate } from '../i18n';
import { useNavigator } from '../state/store';

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
    // Class components cannot use hooks; the language at the moment of failure is enough here.
    const lang = useNavigator.getState().lang;
    return (
      <div className="scene-error" role="alert">
        <p>{translate(lang, 'sceneError.title', { e: this.state.message })}</p>
        <p className="muted">{translate(lang, 'sceneError.hint')}</p>
        <button type="button" className="ghost-button" onClick={() => window.location.reload()}>
          {translate(lang, 'sceneError.reload')}
        </button>
      </div>
    );
  }
}
