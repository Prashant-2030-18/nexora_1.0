import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCcw, ArrowLeft, Layers } from 'lucide-react';

interface Props {
  children: ReactNode;
  onReturnToPlanner: () => void;
  onRetry?: () => void;
  onSwitchTo2D?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  autoFallbackAttempted: boolean;
}

export class NavigationErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    autoFallbackAttempted: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
      autoFallbackAttempted: false,
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[NAV_MAP_ERROR] Uncaught error in navigation UI:', error, errorInfo);
    this.setState({ errorInfo });

    // Auto-fallback to basic 2D navigation immediately without forcing user to manually click button
    if (this.props.onSwitchTo2D && !this.state.autoFallbackAttempted) {
      this.setState({ autoFallbackAttempted: true, hasError: false, error: null });
      this.props.onSwitchTo2D();
    }
  }

  public handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onRetry) {
      this.props.onRetry();
    }
  };

  public handleSwitchTo2D = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onSwitchTo2D) {
      this.props.onSwitchTo2D();
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-full min-h-[500px] flex items-center justify-center bg-slate-950 p-6 select-none font-sans">
          <div className="max-w-md w-full bg-slate-900 border border-red-500/50 rounded-3xl p-6 shadow-2xl shadow-red-950/50 text-white flex flex-col items-center text-center animate-in fade-in zoom-in-95">
            <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400 mb-4 shadow-lg shadow-red-500/10">
              <AlertTriangle className="w-8 h-8" />
            </div>

            <h2 className="text-lg font-black tracking-tight text-white mb-1.5">
              Navigation View Encountered an Error
            </h2>
            <p className="text-xs text-slate-300 mb-4 leading-relaxed">
              The 3D navigation map view could not render properly. Your route, live GPS coordinates, and journey progress are preserved safely.
            </p>

            {this.state.error && (
              <div className="w-full bg-slate-950/80 border border-slate-800 rounded-xl p-3 mb-5 text-left overflow-hidden">
                <p className="text-[11px] font-mono text-red-400 truncate">
                  {this.state.error.message || 'Unknown render error'}
                </p>
              </div>
            )}

            <div className="flex flex-col gap-2.5 w-full">
              {this.props.onSwitchTo2D && (
                <button
                  type="button"
                  onClick={this.handleSwitchTo2D}
                  className="w-full py-2.5 px-4 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition cursor-pointer shadow-lg shadow-sky-500/20"
                >
                  <Layers className="w-4 h-4" />
                  <span>Switch to Basic 2D Navigation</span>
                </button>
              )}

              <div className="flex items-center gap-2 w-full">
                <button
                  type="button"
                  onClick={this.handleRetry}
                  className="flex-1 py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-semibold text-xs rounded-xl border border-slate-700 flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Retry</span>
                </button>

                <button
                  type="button"
                  onClick={this.props.onReturnToPlanner}
                  className="flex-1 py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-semibold text-xs rounded-xl border border-slate-700 flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Route Planner</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
