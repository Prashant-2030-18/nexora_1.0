import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Compass, Lock, Mail, User as UserIcon, Phone,
  ArrowRight, CheckCircle2, AlertCircle, Eye, EyeOff
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';

export const Login: React.FC = () => {
  const [isRegistering, setIsRegistering] = useState<boolean>(false);

  // Login form state — always empty on load
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Register form state — always empty on load
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [smsAlertsEnabled, setSmsAlertsEnabled] = useState(true);
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [regState, setRegState] = useState('Assam');
  const [regRole, setRegRole] = useState<'citizen' | 'logistics_operator'>('citizen');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [regSuccess, setRegSuccess] = useState(false);
  const [isWakingUp, setIsWakingUp] = useState(false);

  const { login, registerAndLogin } = useAuth();
  const navigate = useNavigate();

  const switchToLogin = () => {
    setIsRegistering(false);
    setError(null);
  };

  const switchToRegister = () => {
    setIsRegistering(true);
    setError(null);
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    setIsWakingUp(false);
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err: any) {
      console.error('[NEXORA LOGIN ERROR]', err);
      const httpStatus = err?.response?.status;
      let errorMsg = '';
      const data = err?.response?.data;
      if (data) {
        if (typeof data.detail === 'string') {
          errorMsg = data.detail;
        } else if (Array.isArray(data.detail)) {
          errorMsg = data.detail.map((d: any) => d.msg || JSON.stringify(d)).join(', ');
        } else if (typeof data === 'string' && data.length < 200) {
          errorMsg = data;
        }
      }
      if (!errorMsg) {
        if (httpStatus === 502 || httpStatus === 503 || httpStatus === 504) {
          setIsWakingUp(true);
          errorMsg = 'The secure server is currently waking up from idle. Please wait ~20 seconds and click Sign In again.';
        } else if (err.message === 'Network Error') {
          setIsWakingUp(true);
          errorMsg = 'Cannot connect to server. The backend may be spinning up — please wait a few seconds and try again.';
        } else if (err.code === 'ECONNABORTED') {
          setIsWakingUp(true);
          errorMsg = 'Connection timed out while server was waking up. Please try again.';
        } else {
          errorMsg = err.message || 'Authentication failed. Please check your email and password.';
        }
      }

      if (errorMsg.toLowerCase().includes('not found') || errorMsg.toLowerCase().includes('does not exist')) {
        setError('Account not found. Please register first.');
      } else if (errorMsg.toLowerCase().includes('deactivated') || errorMsg.toLowerCase().includes('inactive')) {
        setError('Your account is inactive. Contact the administrator.');
      } else if (errorMsg.toLowerCase().includes('pending')) {
        setError('Your account is pending approval.');
      } else {
        setError(errorMsg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsWakingUp(false);

    if (regPassword.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    if (!/[A-Z]/.test(regPassword)) {
      setError('Password must contain at least one uppercase letter.');
      return;
    }
    if (!/[0-9]/.test(regPassword)) {
      setError('Password must contain at least one number.');
      return;
    }
    if (regPassword !== regConfirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    const cleanPhone = regPhone.trim();
    if (cleanPhone) {
      const digitsOnly = cleanPhone.replace(/\D/g, '');
      if (digitsOnly.length < 10 || digitsOnly.length > 15) {
        setError('Please enter a valid 10-digit mobile number or international number (e.g. +91 9876543210).');
        return;
      }
    }

    setLoading(true);
    try {
      await registerAndLogin({
        name: regName.trim(),
        email: regEmail.trim(),
        password: regPassword,
        role: regRole,
        state: regState,
        phone: cleanPhone || undefined,
        mobile_number: cleanPhone || undefined,
        sms_alerts_enabled: smsAlertsEnabled,
      });
      setRegSuccess(true);
      setTimeout(() => {
        navigate('/dashboard');
      }, 800);
    } catch (err: any) {
      console.error('[NEXORA REGISTRATION ERROR]', err);
      const httpStatus = err?.response?.status;
      let errorMsg = '';
      const data = err?.response?.data;
      if (data) {
        if (typeof data.detail === 'string') {
          errorMsg = data.detail;
        } else if (Array.isArray(data.detail)) {
          errorMsg = data.detail.map((d: any) => d.msg || JSON.stringify(d)).join(', ');
        } else if (typeof data === 'string' && data.length < 200) {
          errorMsg = data;
        }
      }
      if (!errorMsg) {
        if (httpStatus === 409) {
          errorMsg = 'An account with this email address already exists. Please sign in.';
        } else if (httpStatus === 502 || httpStatus === 503 || httpStatus === 504) {
          setIsWakingUp(true);
          errorMsg = 'The secure server is currently waking up from idle. Please wait ~20 seconds and click Create Account again.';
        } else if (err.message === 'Network Error') {
          setIsWakingUp(true);
          errorMsg = 'Cannot connect to backend server. The instance may be waking up — please try again in a few seconds.';
        } else if (err.code === 'ECONNABORTED') {
          setIsWakingUp(true);
          errorMsg = 'Request timed out while server was waking up. Please try again in a few seconds.';
        } else {
          errorMsg = err.message || 'Registration failed. Please try again.';
        }
      }

      if (httpStatus === 409 || errorMsg.toLowerCase().includes('already exists')) {
        setError('An account with this email address already exists. Please sign in.');
      } else {
        setError(errorMsg);
      }
    } finally {
      setLoading(false);
    }
  };

  const inputClass = "w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all";

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-[400px] h-[400px] bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        {/* Brand Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-sky-500 to-indigo-600 shadow-xl shadow-sky-500/25 ring-1 ring-white/20">
            <Compass className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight">NEXORA</h1>
            <p className="text-xs font-semibold uppercase tracking-widest text-sky-400 mt-1 font-mono">
              Ministry of Development of North Eastern Region (MDoNER)
            </p>
            <p className="text-xs text-slate-400 mt-1">
              AI-Based Smart Logistics & Accessibility Intelligence Platform
            </p>
          </div>
        </div>

        {/* Auth Card */}
        <div className="mt-8 bg-slate-900/90 border border-slate-800 backdrop-blur-xl shadow-2xl rounded-3xl p-6 sm:p-8 space-y-6">
          {/* Tabs */}
          <div className="flex border-b border-slate-800 pb-3 gap-4">
            <button
              onClick={switchToLogin}
              className={`pb-2 text-sm font-semibold transition-colors relative ${
                !isRegistering ? 'text-sky-400 border-b-2 border-sky-400 -mb-3' : 'text-slate-400 hover:text-white'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={switchToRegister}
              className={`pb-2 text-sm font-semibold transition-colors relative ${
                isRegistering ? 'text-sky-400 border-b-2 border-sky-400 -mb-3' : 'text-slate-400 hover:text-white'
              }`}
            >
              Register New Account
            </button>
          </div>

          {/* Alerts */}
          {error && (
            <div className="p-3.5 rounded-xl bg-red-950/50 border border-red-800/60 text-red-200 text-xs flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {isWakingUp && (
            <div className="p-3.5 rounded-xl bg-amber-950/50 border border-amber-800/60 text-amber-200 text-xs flex items-center gap-2.5">
              <div className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping shrink-0" />
              <span>Secure server is waking up from standby (~20-30s). Please wait a moment...</span>
            </div>
          )}
          {regSuccess && (
            <div className="p-3.5 rounded-xl bg-emerald-950/50 border border-emerald-800/60 text-emerald-200 text-xs flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Account created successfully! Logging you into NEXORA...</span>
            </div>
          )}

          {!isRegistering ? (
            /* ── Sign In Form ── */
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Email Address</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email address"
                    className={inputClass}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Password</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-10 py-2.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all"
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 flex items-center justify-center gap-2 bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white text-xs font-bold py-3 px-4 rounded-xl shadow-lg shadow-sky-500/25 transition-all disabled:opacity-50"
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <span>Authenticate & Enter Platform</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <p className="text-center text-xs text-slate-500 pt-1">
                Don't have an account?{' '}
                <button type="button" onClick={switchToRegister} className="text-sky-400 hover:text-sky-300 font-semibold">
                  Register here
                </button>
              </p>
            </form>
          ) : (
            /* ── Register Form ── */
            <form onSubmit={handleRegisterSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Full Name *</label>
                <div className="relative">
                  <UserIcon className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    placeholder="Your full name"
                    className={inputClass}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Email Address *</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    placeholder="you@example.in"
                    className={inputClass}
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-300">
                    Mobile Number <span className="text-slate-500 font-normal">(for Emergency Alerts)</span>
                  </label>
                  <span className="text-[10px] text-sky-400 font-mono">+91 Supported</span>
                </div>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="tel"
                    value={regPhone}
                    onChange={(e) => setRegPhone(e.target.value)}
                    placeholder="9876543210 or +91 98765 43210"
                    className={inputClass}
                  />
                </div>
                <p className="text-[10px] text-slate-500 mt-1">10-digit Indian numbers automatically normalized to +91 E.164 format.</p>
                {regPhone.trim().length > 0 && (
                  <label className="flex items-start gap-2 mt-2 cursor-pointer bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/80 hover:border-slate-700 transition-colors">
                    <input
                      type="checkbox"
                      checked={smsAlertsEnabled}
                      onChange={(e) => setSmsAlertsEnabled(e.target.checked)}
                      className="mt-0.5 rounded border-slate-700 text-sky-500 focus:ring-sky-500 bg-slate-950"
                    />
                    <span className="text-[11px] text-slate-300 leading-tight">
                      Receive critical SACHET NDMA & highway disaster alerts via SMS/IVR when operating in low-connectivity corridors
                    </span>
                  </label>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Role *</label>
                  <select
                    value={regRole}
                    onChange={(e) => setRegRole(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-sky-500"
                  >
                    <option value="citizen">Citizen</option>
                    <option value="logistics_operator">Logistics Operator</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">State / Region *</label>
                  <select
                    value={regState}
                    onChange={(e) => setRegState(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-sky-500"
                  >
                    {['Assam', 'Arunachal Pradesh', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Tripura', 'Sikkim'].map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Password *</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type={showRegPassword ? 'text' : 'password'}
                    required
                    autoComplete="new-password"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    placeholder="Min 8 chars, 1 uppercase, 1 number"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-10 py-2.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                  />
                  <button type="button" onClick={() => setShowRegPassword(!showRegPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                    {showRegPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">Minimum 8 characters, at least 1 uppercase letter and 1 number.</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Confirm Password *</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    autoComplete="new-password"
                    value={regConfirmPassword}
                    onChange={(e) => setRegConfirmPassword(e.target.value)}
                    placeholder="Re-enter your password"
                    className={inputClass}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-1 flex items-center justify-center gap-2 bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white text-xs font-bold py-3 px-4 rounded-xl shadow-lg shadow-sky-500/25 transition-all disabled:opacity-50"
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <span>Create Account</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <p className="text-center text-[10px] text-slate-500">
                Admin accounts are provisioned by authorized MDoNER administrators only.
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
