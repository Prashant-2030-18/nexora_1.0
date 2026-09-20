import React, { useState, useEffect, useRef } from 'react';
import {
  Users, AlertTriangle, MapPin, Clock, Search, CheckCircle2,
  Send, Locate, Camera, CameraOff, ShieldCheck, AlertCircle,
  X, ZoomIn, Trash2, Check, Filter, RefreshCw, Eye, Info, ExternalLink,
  Cpu, Activity, Sparkles, CheckCircle, RotateCw, FileCheck, Globe, Navigation
} from 'lucide-react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useGPS } from '../context/GPSContext';
import { UserReportData } from '../types';

// Map picker pin icon
const createMapPickerIcon = () => {
  return L.divIcon({
    className: 'custom-picker-icon',
    html: `
      <div style="
        position: relative;
        background-color: #f59e0b;
        width: 36px;
        height: 36px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 19px;
        color: white;
        border: 2.5px solid #ffffff;
        box-shadow: 0 4px 16px rgba(0,0,0,0.7);
      ">
        <span style="
          position: absolute;
          inset: -6px;
          border-radius: 50%;
          border: 2px solid #f59e0b;
          animation: pulse 1.5s cubic-bezier(0.2, 0.8, 0.2, 1) infinite;
        "></span>
        <span>📍</span>
      </div>
    `,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -18],
  });
};

// Map click event capturer for Leaflet
const MapClickCapture: React.FC<{ onPick: (lat: number, lng: number) => void }> = ({ onPick }) => {
  useMapEvents({
    click(e) {
      onPick(parseFloat(e.latlng.lat.toFixed(6)), parseFloat(e.latlng.lng.toFixed(6)));
    },
  });
  return null;
};

// Helper: classify geographic scope without rejecting valid global coordinates
const getLocationScope = (lat: number | '', lon: number | ''): { scope: string; label: string; color: string; badgeColor: string } | null => {
  if (lat === '' || lon === '' || isNaN(Number(lat)) || isNaN(Number(lon))) return null;
  const numLat = Number(lat);
  const numLon = Number(lon);
  if (numLat < -90 || numLat > 90 || numLon < -180 || numLon > 180) {
    return { scope: 'INVALID', label: 'Invalid Global Coordinates', color: 'text-red-400 bg-red-950/60 border-red-800', badgeColor: 'bg-red-950 text-red-300 border-red-800' };
  }
  if (numLat >= 21.5 && numLat <= 29.8 && numLon >= 88.0 && numLon <= 97.5) {
    return { scope: 'NER', label: 'NER (Primary Operational Scope)', color: 'text-emerald-400 bg-emerald-950/60 border-emerald-800', badgeColor: 'bg-emerald-950 text-emerald-300 border-emerald-800' };
  }
  if (numLat >= 8.0 && numLat <= 37.0 && numLon >= 68.0 && numLon <= 97.5) {
    return { scope: 'INDIA_OUTSIDE_NER', label: 'India (Outside NER)', color: 'text-sky-400 bg-sky-950/60 border-sky-800', badgeColor: 'bg-sky-950 text-sky-300 border-sky-800' };
  }
  return { scope: 'GLOBAL_OUTSIDE_INDIA', label: 'Global Location (Worldwide)', color: 'text-purple-400 bg-purple-950/60 border-purple-800', badgeColor: 'bg-purple-950 text-purple-300 border-purple-800' };
};


const HAZARD_TYPES = [
  'Landslide',
  'Flash Flood',
  'Waterlogging',
  'Rockfall',
  'Mudflow',
  'Road Subsidence',
  'Bridge / Culvert Damage',
  'Tree Fall',
  'Highway Blockage',
  'Vehicle Accident',
  'Snow / Frost Blockage',
  'River Overflow',
  'Other Hazard'
];

const SEVERITY_LEVELS = [
  { value: 'CRITICAL', label: 'Critical — Both lanes blocked / life hazard', color: 'text-red-400 border-red-500/40 bg-red-500/10' },
  { value: 'HIGH', label: 'High — Single lane passable / heavy congestion', color: 'text-orange-400 border-orange-500/40 bg-orange-500/10' },
  { value: 'MODERATE', label: 'Moderate — Caution / slow moving traffic', color: 'text-amber-400 border-amber-500/40 bg-amber-500/10' },
  { value: 'LOW', label: 'Low — Minor obstruction on shoulder', color: 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10' }
];

export const CitizenPortalPage: React.FC = () => {
  const { user } = useAuth();
  const isOperator = user && ['admin', 'logistics_operator', 'state_gov'].includes(user.role);

  const [reports, setReports] = useState<UserReportData[]>([]);
  const [stats, setStats] = useState<{
    total: number;
    ai_verified: number;
    ai_review: number;
    ai_rejected: number;
    corroborated: number;
    pending: number;
    approved: number;
    rejected: number;
  }>({
    total: 0,
    ai_verified: 0,
    ai_review: 0,
    ai_rejected: 0,
    corroborated: 0,
    pending: 0,
    approved: 0,
    rejected: 0
  });
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'AI_SUPPORTED' | 'SACHET_CORROBORATED' | 'AI_REVIEW' | 'AI_REJECTED' | 'MY_REPORTS'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Privacy mask helper for citizen phone numbers
  const maskPhone = (phone?: string) => {
    if (!phone) return '';
    if (phone.includes('XXXXX')) return phone;
    const digits = phone.replace(/\D/g, '');
    if (digits.length >= 4) {
      const last4 = digits.slice(-4);
      return `+91-XXXXX-${last4}`;
    }
    return phone;
  };

  const [expandedChecklistIds, setExpandedChecklistIds] = useState<Set<number>>(new Set());
  const toggleChecklist = (id: number) => {
    setExpandedChecklistIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Form state
  const [reporterName, setReporterName] = useState(user?.name || '');
  const [reporterPhone, setReporterPhone] = useState(user?.phone || '');
  const [hazardType, setHazardType] = useState('Landslide');
  const [severity, setSeverity] = useState('MODERATE');
  const [locationName, setLocationName] = useState('');
  const [latitude, setLatitude] = useState<number | ''>('');
  const [longitude, setLongitude] = useState<number | ''>('');
  const [description, setDescription] = useState('');

  // Evidence file upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isUploadingEvidence, setIsUploadingEvidence] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Submission status & Live AI Verification Feedback
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitPhase, setSubmitPhase] = useState<'IDLE' | 'TRANSMITTING' | 'VERIFYING' | 'DONE'>('IDLE');
  const [lastVerificationResult, setLastVerificationResult] = useState<any | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [verifyingId, setVerifyingId] = useState<number | null>(null);

  const { getFreshFix } = useGPS();
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);

  // Map Picker Modal
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [pickerLat, setPickerLat] = useState<number | null>(null);
  const [pickerLng, setPickerLng] = useState<number | null>(null);

  // Lightbox Modal
  const [lightboxImage, setLightboxImage] = useState<{ url: string; caption: string; location: string } | null>(null);

  // Moderation Reject Modal (Emergency Operator Override)
  const [rejectModalId, setRejectModalId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [isModerating, setIsModerating] = useState(false);

  const fetchReportsAndStats = async () => {
    setLoading(true);
    try {
      const [repData, statData] = await Promise.all([
        api.getUserReportedDisasters(),
        api.getUserReportStats()
      ]);
      setReports(Array.isArray(repData) ? repData : []);
      if (statData) setStats(statData);
    } catch (err) {
      console.error('Error fetching citizen reports:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReportsAndStats();
  }, []);

  // Handle live high-accuracy GPS location
  const handleGetCurrentLocation = async () => {
    setIsLocating(true);
    setSubmitError(null);
    try {
      const fix = await getFreshFix();
      setLatitude(fix.latitude);
      setLongitude(fix.longitude);
      setGpsAccuracy(fix.accuracy);
      try {
        const rev = await api.reverseGeocode(fix.latitude, fix.longitude);
        if (rev?.display_name && !locationName) {
          setLocationName(rev.display_name.split(',').slice(0, 3).join(', '));
        }
      } catch {
        // ignore reverse geocode error
      }
    } catch (err: any) {
      setSubmitError(`Could not obtain GPS coordinates: ${err?.message || err}. Please enter manually or pick on map.`);
    } finally {
      setIsLocating(false);
    }
  };

  const handleOpenMapPicker = () => {
    if (typeof latitude === 'number' && typeof longitude === 'number') {
      setPickerLat(latitude);
      setPickerLng(longitude);
    } else {
      setPickerLat(26.1445);
      setPickerLng(91.7362);
    }
    setShowMapPicker(true);
  };

  const handleConfirmMapPicker = async () => {
    if (pickerLat !== null && pickerLng !== null) {
      setLatitude(pickerLat);
      setLongitude(pickerLng);
      setShowMapPicker(false);
      try {
        const rev = await api.reverseGeocode(pickerLat, pickerLng);
        if (rev?.display_name && !locationName) {
          setLocationName(rev.display_name.split(',').slice(0, 3).join(', '));
        }
      } catch {
        // ignore reverse geocode error
      }
    }
  };

  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate type
    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      setSubmitError('Invalid file format. Please upload a JPG, PNG, or WEBP image.');
      return;
    }

    // Validate size (5 MB)
    if (file.size > 5 * 1024 * 1024) {
      setSubmitError('Image file is too large. Maximum allowed size is 5 MB.');
      return;
    }

    setSubmitError(null);
    setSelectedFile(file);
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Handle form submission with AI verification progression
  const handleReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (latitude === '' || longitude === '') {
      setSubmitError('Please specify valid latitude and longitude coordinates.');
      return;
    }

    setIsSubmitting(true);
    setSubmitPhase('TRANSMITTING');
    setSubmitError(null);
    setLastVerificationResult(null);

    try {
      let uploadedEvidenceUrl: string | undefined = undefined;
      let uploadedEvidenceHash: string | undefined = undefined;

      // 1. Upload evidence file if provided
      if (selectedFile) {
        setIsUploadingEvidence(true);
        try {
          const uploadRes = await api.uploadReportEvidence(selectedFile);
          uploadedEvidenceUrl = uploadRes.image_url;
          uploadedEvidenceHash = uploadRes.evidence_hash;
        } catch (upErr: any) {
          throw new Error(upErr?.response?.data?.detail || 'Failed to upload evidence image. Please try again.');
        } finally {
          setIsUploadingEvidence(false);
        }
      }

      setSubmitPhase('VERIFYING');

      // 2. Transmit disaster report (Backend synchronously executes multi-signal AI verifier)
      const res = await api.reportUserDisaster({
        type: hazardType,
        severity: severity,
        latitude: Number(latitude),
        longitude: Number(longitude),
        location_name: locationName.trim() || `Near ${Number(latitude).toFixed(4)}, ${Number(longitude).toFixed(4)}`,
        description: description.trim(),
        reportedBy: reporterName.trim() || (isOperator ? 'Logistics Operator' : 'Citizen'),
        contactInfo: reporterPhone.trim() || undefined,
        evidenceUrl: uploadedEvidenceUrl,
        radiusKm: severity === 'CRITICAL' ? 10.0 : severity === 'HIGH' ? 7.0 : 5.0,
        gps_accuracy: gpsAccuracy || undefined,
        evidence_hash: uploadedEvidenceHash
      });

      setSubmitPhase('DONE');
      setLastVerificationResult(res);

      // Reset form
      setHazardType('Landslide');
      setSeverity('MODERATE');
      setLocationName('');
      setLatitude('');
      setLongitude('');
      setDescription('');
      handleRemoveFile();

      await fetchReportsAndStats();
    } catch (err: any) {
      setSubmitPhase('IDLE');
      setSubmitError(err?.message || err?.response?.data?.detail || 'Failed to submit report. Please check details.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Re-verify report with AI Engine
  const handleReverify = async (id: number) => {
    setVerifyingId(id);
    try {
      await api.reverifyUserReport(id);
      await fetchReportsAndStats();
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'AI Re-verification failed.');
    } finally {
      setVerifyingId(null);
    }
  };

  // Operator Emergency Overrides
  const handleApprove = async (id: number) => {
    setIsModerating(true);
    try {
      await api.approveUserReport(id, 'Verified by ground logistics operator.');
      await fetchReportsAndStats();
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Approval override failed.');
    } finally {
      setIsModerating(false);
    }
  };

  const handleOpenRejectModal = (id: number) => {
    setRejectModalId(id);
    setRejectReason('');
  };

  const handleConfirmReject = async () => {
    if (!rejectModalId) return;
    setIsModerating(true);
    try {
      await api.rejectUserReport(rejectModalId, rejectReason.trim() || 'Report unverified / inaccurate.');
      setRejectModalId(null);
      await fetchReportsAndStats();
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Rejection failed.');
    } finally {
      setIsModerating(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Are you sure you want to permanently delete this citizen report? Any evidence files will also be removed.')) {
      return;
    }
    try {
      await api.deleteUserDisaster(id);
      await fetchReportsAndStats();
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Delete failed.');
    }
  };

  // Filtered reports
  const filteredReports = reports.filter((rep) => {
    const vStatus = (rep.verification_status || 'AI_REVIEW').toUpperCase();
    const rawStatus = (rep.status || 'PENDING').toUpperCase();

    const isSachetCorroborated = vStatus === 'SACHET_CORROBORATED' || rawStatus === 'CORROBORATED';
    const isAiSupported = vStatus === 'AI_SUPPORTED' || vStatus === 'AI_VERIFIED' || (['APPROVED', 'VERIFIED', 'ACTIVE'].includes(rawStatus) && !['AI_REJECTED', 'AI_UNSUPPORTED', 'AI_REVIEW', 'SACHET_CORROBORATED'].includes(vStatus));
    const isAiRejected = vStatus === 'AI_UNSUPPORTED' || vStatus === 'AI_REJECTED' || rawStatus === 'REJECTED';
    const isAiReview = !isAiSupported && !isSachetCorroborated && !isAiRejected;

    if (activeFilter === 'AI_SUPPORTED' && !isAiSupported) return false;
    if (activeFilter === 'SACHET_CORROBORATED' && !isSachetCorroborated) return false;
    if (activeFilter === 'AI_REVIEW' && !isAiReview) return false;
    if (activeFilter === 'AI_REJECTED' && !isAiRejected) return false;
    if (activeFilter === 'MY_REPORTS') {
      const myName = (reporterName || user?.name || '').toLowerCase();
      const repName = (rep.reporter_name || rep.reported_by || '').toLowerCase();
      if (!myName || !repName.includes(myName)) return false;
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchType = (rep.disaster_type || rep.type || '').toLowerCase().includes(q);
      const matchLoc = (rep.location_name || '').toLowerCase().includes(q);
      const matchDesc = (rep.description || '').toLowerCase().includes(q);
      const matchReporter = (rep.reporter_name || rep.reported_by || '').toLowerCase().includes(q);
      return matchType || matchLoc || matchDesc || matchReporter;
    }
    return true;
  });

  const supportedCount = stats.ai_verified ?? stats.approved ?? 0;
  const sachetCount = stats.corroborated ?? 0;
  const reviewCount = stats.ai_review ?? stats.pending ?? 0;
  const rejectedCount = stats.ai_rejected ?? stats.rejected ?? 0;

  return (
    <div className="space-y-6 pb-16">
      {/* Header */}
      <div className="border-b border-slate-800 pb-3 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Cpu className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-bold text-emerald-400 uppercase tracking-widest font-mono">
              AI-Verified Citizen Intelligence Network
            </span>
            <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded-full font-bold">
              Autonomous Verification Engine Active
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Citizen Ground Disaster Reporting
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Submit real-time road hazards with field evidence. NEXORA's multi-signal AI verification engine validates coordinates, photographic evidence, and SACHET alerts before propagating to the GIS route engine.
          </p>
        </div>

        <button
          onClick={fetchReportsAndStats}
          disabled={loading}
          className="self-start md:self-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-xs font-semibold text-slate-300 hover:text-white transition-all cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-sky-400' : ''}`} />
          <span>Refresh Feed</span>
        </button>
      </div>

      {/* KPI Counters Ribbon with AI Verification Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="glass-panel p-3.5 rounded-xl border border-slate-800 bg-slate-900/60">
          <div className="text-[10px] font-bold text-slate-400 uppercase font-mono">Total Submissions</div>
          <div className="text-xl font-extrabold text-white mt-0.5 font-mono">{stats.total}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">Citizen telemetry logs</div>
        </div>

        <div className="glass-panel p-3.5 rounded-xl border border-emerald-900/30 bg-emerald-950/10">
          <div className="text-[10px] font-bold text-emerald-400 uppercase font-mono flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            AI-Supported
          </div>
          <div className="text-xl font-extrabold text-emerald-300 mt-0.5 font-mono">{supportedCount}</div>
          <div className="text-[10px] text-emerald-500/70 mt-0.5">Active route avoidance</div>
        </div>

        <div className="glass-panel p-3.5 rounded-xl border border-sky-900/30 bg-sky-950/10">
          <div className="text-[10px] font-bold text-sky-400 uppercase font-mono flex items-center gap-1">
            <CheckCircle className="w-3.5 h-3.5 text-sky-400" />
            Corroborated
          </div>
          <div className="text-xl font-extrabold text-sky-300 mt-0.5 font-mono">{sachetCount}</div>
          <div className="text-[10px] text-sky-500/70 mt-0.5">Linked to NDMA SACHET</div>
        </div>

        <div className="glass-panel p-3.5 rounded-xl border border-amber-900/30 bg-amber-950/10">
          <div className="text-[10px] font-bold text-amber-400 uppercase font-mono flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            AI Review
          </div>
          <div className="text-xl font-extrabold text-amber-300 mt-0.5 font-mono">{reviewCount}</div>
          <div className="text-[10px] text-amber-500/70 mt-0.5">Cautionary (Non-blocking)</div>
        </div>

        <div className="glass-panel p-3.5 rounded-xl border border-slate-800 bg-slate-900/60">
          <div className="text-[10px] font-bold text-slate-400 uppercase font-mono flex items-center gap-1">
            <X className="w-3.5 h-3.5 text-slate-500" />
            Unsupported
          </div>
          <div className="text-xl font-extrabold text-slate-400 mt-0.5 font-mono">{rejectedCount}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">Spurious / Unverified</div>
        </div>
      </div>

      {/* Main Content Layout: Form on Left, Submissions Feed on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Form */}
        <div className="lg:col-span-5 glass-panel p-5 sm:p-6 rounded-2xl border border-slate-800 shadow-xl space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
            <div>
              <h2 className="text-base font-bold text-white">Transmit Ground Hazard Report</h2>
              <p className="text-[11px] text-slate-400">Automated multi-signal AI verification checks location, taxonomy & evidence</p>
            </div>
          </div>

          {/* Submission in-progress indicators */}
          {isSubmitting && submitPhase === 'TRANSMITTING' && (
            <div className="p-3 bg-sky-950/60 border border-sky-600/50 rounded-xl text-xs text-sky-200 flex items-center gap-2 font-mono">
              <RefreshCw className="w-4 h-4 animate-spin text-sky-400 shrink-0" />
              <span>REPORT RECEIVED — Transmitting ground telemetry and evidence hash...</span>
            </div>
          )}
          {isSubmitting && submitPhase === 'VERIFYING' && (
            <div className="p-3 bg-indigo-950/60 border border-indigo-600/50 rounded-xl text-xs text-indigo-200 flex items-center gap-2 font-mono">
              <Cpu className="w-4 h-4 animate-spin text-indigo-400 shrink-0" />
              <span>ANALYZING EVIDENCE — Multi-Signal AI Verification Engine evaluating report...</span>
            </div>
          )}

          {/* AI Verification Progression Card upon submission */}
          {lastVerificationResult && (
            <div className={`p-4 rounded-xl border space-y-3 transition-all ${
              lastVerificationResult.verification_status === 'SACHET_CORROBORATED'
                ? 'bg-sky-950/70 border-sky-500/70 text-sky-200'
                : lastVerificationResult.verification_status === 'AI_SUPPORTED' || lastVerificationResult.verification_status === 'AI_VERIFIED'
                ? 'bg-emerald-950/70 border-emerald-500/70 text-emerald-200'
                : lastVerificationResult.verification_status === 'AI_UNSUPPORTED' || lastVerificationResult.verification_status === 'AI_REJECTED'
                ? 'bg-red-950/70 border-red-700/70 text-red-200'
                : 'bg-amber-950/70 border-amber-600/70 text-amber-200'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold text-xs">
                  {lastVerificationResult.verification_status === 'SACHET_CORROBORATED' ? (
                    <CheckCircle className="w-4 h-4 text-sky-400 shrink-0" />
                  ) : lastVerificationResult.verification_status === 'AI_SUPPORTED' || lastVerificationResult.verification_status === 'AI_VERIFIED' ? (
                    <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : lastVerificationResult.verification_status === 'AI_UNSUPPORTED' || lastVerificationResult.verification_status === 'AI_REJECTED' ? (
                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                  ) : (
                    <Clock className="w-4 h-4 text-amber-400 shrink-0" />
                  )}
                  <span className="font-extrabold uppercase tracking-wide">
                    {lastVerificationResult.verification_status === 'SACHET_CORROBORATED'
                      ? 'OFFICIAL ALERT ALREADY ACTIVE'
                      : lastVerificationResult.verification_status === 'AI_SUPPORTED' || lastVerificationResult.verification_status === 'AI_VERIFIED'
                      ? 'AI-SUPPORTED CITIZEN REPORT'
                      : lastVerificationResult.verification_status === 'AI_UNSUPPORTED' || lastVerificationResult.verification_status === 'AI_REJECTED'
                      ? 'REPORT NOT SUPPORTED'
                      : 'AI REVIEW REQUIRED'}
                  </span>
                </div>
                <span className="font-mono text-xs font-black">
                  Confidence: {Math.round((lastVerificationResult.ai_confidence || 0.7) * 100)}%
                </span>
              </div>

              <div className="text-[11px] leading-relaxed opacity-95">
                {lastVerificationResult.verification_status === 'SACHET_CORROBORATED' && (
                  <p>
                    <strong>Official SACHET Corroboration:</strong> This citizen report matches an active official NDMA SACHET disaster alert ({lastVerificationResult.corroborated_sachet_identifier || 'CAP Alert'}) and has been linked as field ground-truth corroboration. The official alert remains the primary route-impacting hazard to prevent duplicate blockage.
                  </p>
                )}
                {(lastVerificationResult.verification_status === 'AI_SUPPORTED' || lastVerificationResult.verification_status === 'AI_VERIFIED') && (
                  <p>
                    <strong>Route Engine Updated:</strong> Strong multi-signal independent evidence confirmed. This hazard is now actively integrated into regional logistics route avoidance calculations and GPS navigation alerts.
                  </p>
                )}
                {lastVerificationResult.verification_status === 'AI_REVIEW' && (
                  <p>
                    <strong>Advisory Logged:</strong> Report registered as a cautionary advisory. Route is not blocked because single citizen submissions without sufficient independent corroboration require further field verification.
                  </p>
                )}
                {(lastVerificationResult.verification_status === 'AI_UNSUPPORTED' || lastVerificationResult.verification_status === 'AI_REJECTED') && (
                  <p>
                    <strong>EVIDENCE DOES NOT CLEARLY SUPPORT THE REPORTED HAZARD.</strong> {lastVerificationResult.ai_reason || 'Filtered from operational hazards and route calculations.'}
                  </p>
                )}
              </div>

              {/* Structured Signal Checklist */}
              {lastVerificationResult.signals_checklist && lastVerificationResult.signals_checklist.length > 0 && (
                <div className="mt-2 p-2.5 bg-slate-950/80 rounded-xl border border-slate-800/80 space-y-1.5">
                  <div className="text-[10px] font-bold text-slate-300 font-mono uppercase tracking-wider flex items-center gap-1.5">
                    <Cpu className="w-3.5 h-3.5 text-sky-400" />
                    <span>Multi-Signal Verification Checklist:</span>
                  </div>
                  <div className="space-y-1 text-[10px] font-mono">
                    {lastVerificationResult.signals_checklist.map((item: any, idx: number) => (
                      <div key={idx} className="flex items-start gap-1.5">
                        {item.status === 'passed' ? (
                          <span className="text-emerald-400 font-bold shrink-0">✓</span>
                        ) : item.status === 'failed' ? (
                          <span className="text-red-400 font-bold shrink-0">✕</span>
                        ) : (
                          <span className="text-slate-400 font-bold shrink-0">○</span>
                        )}
                        <div>
                          <strong className={item.status === 'passed' ? 'text-emerald-300' : item.status === 'failed' ? 'text-red-300' : 'text-slate-300'}>
                            {item.label}:
                          </strong>{' '}
                          <span className="text-slate-400">{item.detail}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {lastVerificationResult.location_scope && (
                <div className="pt-0.5 flex items-center gap-1.5 text-[10px] font-mono">
                  <Globe className="w-3.5 h-3.5 text-sky-400" />
                  <span className="text-slate-400">Location Scope:</span>
                  <strong className="text-sky-300">{lastVerificationResult.location_scope.replace(/_/g, ' ')}</strong>
                </div>
              )}
            </div>
          )}

          {submitError && (
            <div className="p-3 bg-red-950/60 border border-red-800 rounded-xl text-xs text-red-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{submitError}</span>
            </div>
          )}

          <form onSubmit={handleReportSubmit} className="space-y-4 text-xs">
            {/* Reporter Info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Your Full Name</label>
                <input
                  type="text"
                  required
                  value={reporterName}
                  onChange={(e) => setReporterName(e.target.value)}
                  placeholder="e.g. Ramesh Kalita"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white placeholder:text-slate-600 focus:outline-none focus:border-sky-500"
                />
              </div>
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Contact Phone (Optional)</label>
                <input
                  type="tel"
                  value={reporterPhone}
                  onChange={(e) => setReporterPhone(e.target.value)}
                  placeholder="+91-98765-43210"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white placeholder:text-slate-600 focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>

            {/* Hazard Type & Severity */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Hazard Classification</label>
                <select
                  value={hazardType}
                  onChange={(e) => setHazardType(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-sky-500 cursor-pointer"
                >
                  {HAZARD_TYPES.map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Severity / Impact</label>
                <select
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-sky-500 cursor-pointer"
                >
                  {SEVERITY_LEVELS.map((sev) => (
                    <option key={sev.value} value={sev.value}>{sev.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Landmark / Location */}
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Landmark / Road Name</label>
              <input
                type="text"
                required
                value={locationName}
                onChange={(e) => setLocationName(e.target.value)}
                placeholder="e.g. NH-6 near Sonapur Tunnel, East Jaintia Hills"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white placeholder:text-slate-600 focus:outline-none focus:border-sky-500"
              />
            </div>

            {/* Coordinates with GPS auto-fill and Map Picker */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-slate-300 font-semibold">Incident Coordinates (Lat / Lon)</label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleGetCurrentLocation}
                    disabled={isLocating}
                    className="text-sky-400 hover:text-sky-300 text-[11px] flex items-center gap-1 font-semibold cursor-pointer"
                  >
                    <Locate className="w-3 h-3" />
                    <span>{isLocating ? 'Locating...' : 'GPS Auto-Fill'}</span>
                  </button>
                  <span className="text-slate-600">|</span>
                  <button
                    type="button"
                    onClick={handleOpenMapPicker}
                    className="text-amber-400 hover:text-amber-300 text-[11px] flex items-center gap-1 font-semibold cursor-pointer"
                  >
                    <MapPin className="w-3 h-3" />
                    <span>Pick on Map</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <input
                  type="number"
                  step="any"
                  required
                  value={latitude}
                  onChange={(e) => setLatitude(e.target.value === '' ? '' : parseFloat(e.target.value))}
                  placeholder="Latitude (-90 to +90°)"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white placeholder:text-slate-600 focus:outline-none focus:border-sky-500 font-mono"
                />
                <input
                  type="number"
                  step="any"
                  required
                  value={longitude}
                  onChange={(e) => setLongitude(e.target.value === '' ? '' : parseFloat(e.target.value))}
                  placeholder="Longitude (-180 to +180°)"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white placeholder:text-slate-600 focus:outline-none focus:border-sky-500 font-mono"
                />
              </div>

              {/* Dynamic Scope & Accuracy Indicator */}
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                {(() => {
                  const scopeInfo = getLocationScope(latitude, longitude);
                  return scopeInfo ? (
                    <div className="flex items-center gap-1.5 text-[10px] font-mono">
                      <span className="text-slate-400">Scope:</span>
                      <span className={`px-2 py-0.5 rounded-full border font-bold ${scopeInfo.color}`}>
                        {scopeInfo.label}
                      </span>
                    </div>
                  ) : (
                    <span className="text-[10px] text-slate-500 font-mono">Global coordinate range (-90..+90, -180..+180)</span>
                  );
                })()}
                {gpsAccuracy !== null && (
                  <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" />
                    GPS Accuracy: ±{gpsAccuracy}m
                  </span>
                )}
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Field Observations & Description</label>
              <textarea
                required
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe current road conditions, debris volume, stranded vehicles, weather impact..."
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white placeholder:text-slate-600 focus:outline-none focus:border-sky-500"
              />
            </div>

            {/* Evidence Image Upload */}
            <div>
              <label className="block text-slate-300 font-semibold mb-1 flex items-center justify-between">
                <span>Field Evidence Photo (Recommended)</span>
                <span className="text-[10px] text-emerald-400 font-normal">Boosts AI Confidence</span>
              </label>

              {!previewUrl ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-700 hover:border-slate-500 rounded-xl p-4 text-center cursor-pointer transition-colors bg-slate-900/40 hover:bg-slate-900/80"
                >
                  <Camera className="w-6 h-6 text-slate-400 mx-auto mb-1.5" />
                  <p className="text-slate-300 font-semibold text-xs">Click to upload photo evidence</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">JPG, PNG, WEBP &le; 5 MB. Analyzed by AI Vision model</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </div>
              ) : (
                <div className="relative rounded-xl border border-slate-700 bg-slate-900 p-2 flex items-center gap-3">
                  <img
                    src={previewUrl}
                    alt="Evidence Preview"
                    className="w-16 h-16 object-cover rounded-lg border border-slate-700 shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium text-xs truncate">{selectedFile?.name}</p>
                    <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                      {selectedFile ? `${(selectedFile.size / 1024).toFixed(1)} KB` : ''}
                    </p>
                    <span className="inline-block text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded mt-1 font-bold">
                      Ready for AI inspection
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleRemoveFile}
                    className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-red-400 rounded-lg transition-colors cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            {/* Submit Button with Dynamic AI Verification Phase */}
            <button
              type="submit"
              disabled={isSubmitting || isUploadingEvidence}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 px-4 rounded-xl transition-all shadow-lg shadow-emerald-950/50 flex items-center justify-center gap-2 text-xs disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <RotateCw className="w-4 h-4 animate-spin text-white" />
                  <span>
                    {submitPhase === 'TRANSMITTING'
                      ? 'Transmitting Hazard Telemetry...'
                      : 'AI Engine Analyzing Signals & Vision...'}
                  </span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>Transmit Report to AI Verification Engine</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Right Column: Feed of Verified & Monitored Citizen Reports */}
        <div className="lg:col-span-7 space-y-4">
          {/* Controls Bar: Filters & Search */}
          <div className="glass-panel p-3 sm:p-4 rounded-2xl border border-slate-800 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Filter className="w-4 h-4 text-sky-400" />
                <span className="text-xs font-bold text-white uppercase font-mono">Intelligence Feed</span>
              </div>

              {/* Status Tabs */}
              <div className="flex flex-wrap items-center gap-1 bg-slate-900/90 p-1 rounded-xl border border-slate-800">
                {(['ALL', 'AI_SUPPORTED', 'SACHET_CORROBORATED', 'AI_REVIEW', 'AI_REJECTED', 'MY_REPORTS'] as const).map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setActiveFilter(filter)}
                    className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all cursor-pointer ${
                      activeFilter === filter
                        ? 'bg-sky-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {filter === 'ALL'
                      ? 'All'
                      : filter === 'AI_SUPPORTED'
                      ? 'AI-Supported'
                      : filter === 'SACHET_CORROBORATED'
                      ? 'Corroborated'
                      : filter === 'AI_REVIEW'
                      ? 'AI Review'
                      : filter === 'AI_REJECTED'
                      ? 'Rejected'
                      : 'My Reports'}
                  </button>
                ))}
              </div>
            </div>

            {/* Keyword Search */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by hazard, location, highway, or reporter..."
                className="w-full bg-slate-900/90 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-sky-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Report Cards Feed */}
          <div className="space-y-3 max-h-[820px] overflow-y-auto pr-1">
            {loading ? (
              <div className="p-8 text-center text-slate-400 text-xs glass-panel rounded-2xl border border-slate-800">
                <div className="w-6 h-6 border-2 border-sky-400 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                <span>Loading citizen disaster feed...</span>
              </div>
            ) : filteredReports.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs glass-panel rounded-2xl border border-slate-800 space-y-1.5">
                <Info className="w-6 h-6 text-slate-500 mx-auto mb-1" />
                <p className="font-semibold text-slate-300">No citizen reports match this criteria.</p>
                <p className="text-slate-500 text-[11px]">
                  {activeFilter !== 'ALL'
                    ? `No reports matching the '${activeFilter}' filter.`
                    : 'Ground submissions will appear here in real-time once verified.'}
                </p>
              </div>
            ) : (
              filteredReports.map((rep) => {
                const vStatus = (rep.verification_status || 'AI_REVIEW').toUpperCase();
                const rawStatus = (rep.status || 'PENDING').toUpperCase();

                const isSachetCorroborated = vStatus === 'SACHET_CORROBORATED' || rawStatus === 'CORROBORATED';
                const isAiSupported = vStatus === 'AI_SUPPORTED' || vStatus === 'AI_VERIFIED' || (['APPROVED', 'VERIFIED', 'ACTIVE'].includes(rawStatus) && !['AI_REJECTED', 'AI_UNSUPPORTED', 'AI_REVIEW', 'SACHET_CORROBORATED'].includes(vStatus));
                const isAiRejected = vStatus === 'AI_UNSUPPORTED' || vStatus === 'AI_REJECTED' || rawStatus === 'REJECTED';
                const isAiReview = !isAiSupported && !isSachetCorroborated && !isAiRejected;

                const sev = (rep.severity || 'MODERATE').toUpperCase();
                const sevConfig = SEVERITY_LEVELS.find((s) => s.value === sev) || SEVERITY_LEVELS[2];
                const evidence = rep.evidence_url || rep.image_url || rep.evidenceUrl;
                const confScore = rep.ai_confidence !== undefined ? rep.ai_confidence : (rep.confidence || 0.70);
                const confPct = Math.round(confScore * 100);

                const repScopeInfo = (() => {
                  const scope = rep.location_scope || rep.locationScope;
                  if (scope) return { scope, label: scope.replace(/_/g, ' ') };
                  const sc = getLocationScope(rep.latitude, rep.longitude);
                  return sc ? { scope: sc.scope, label: sc.scope.replace(/_/g, ' ') } : null;
                })();

                return (
                  <div
                    key={rep.id}
                    className={`glass-panel p-4 rounded-xl border space-y-3 transition-all ${
                      isSachetCorroborated
                        ? 'border-sky-700/40 bg-sky-950/10'
                        : isAiSupported
                        ? 'border-emerald-700/40 bg-emerald-950/10'
                        : isAiRejected
                        ? 'border-red-800/30 bg-red-950/10 opacity-75'
                        : 'border-amber-700/40 bg-amber-950/10'
                    }`}
                  >
                    {/* Card Header */}
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-white text-sm">
                            {rep.disaster_type || rep.hazard_type || rep.type || 'Hazard'}
                          </span>
                          <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded border ${sevConfig.color}`}>
                            {sev}
                          </span>
                          {repScopeInfo && (
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded border font-mono ${
                              repScopeInfo.scope === 'NER'
                                ? 'bg-emerald-950 text-emerald-300 border-emerald-800/80'
                                : repScopeInfo.scope === 'INDIA_OUTSIDE_NER'
                                ? 'bg-sky-950 text-sky-300 border-sky-800/80'
                                : 'bg-purple-950 text-purple-300 border-purple-800/80'
                            }`}>
                              {repScopeInfo.label}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-slate-300 font-medium">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{rep.location_name || 'Reported Corridor'}</span>
                        </div>
                      </div>

                      {/* Verification Status Badge */}
                      {isSachetCorroborated ? (
                        <span className="text-[10px] font-extrabold px-2.5 py-1 rounded-full border font-mono uppercase tracking-wider flex items-center gap-1 bg-sky-500/20 text-sky-300 border-sky-500/40">
                          <CheckCircle className="w-3 h-3 text-sky-400" />
                          <span>OFFICIAL ALERT CORROBORATED</span>
                        </span>
                      ) : isAiSupported ? (
                        <span className="text-[10px] font-extrabold px-2.5 py-1 rounded-full border font-mono uppercase tracking-wider flex items-center gap-1 bg-emerald-500/20 text-emerald-300 border-emerald-500/40">
                          <ShieldCheck className="w-3 h-3 text-emerald-400" />
                          <span>AI-SUPPORTED CITIZEN HAZARD (NON-OFFICIAL)</span>
                        </span>
                      ) : isAiRejected ? (
                        <span className="text-[10px] font-extrabold px-2.5 py-1 rounded-full border font-mono uppercase tracking-wider flex items-center gap-1 bg-red-500/20 text-red-300 border-red-500/40">
                          <X className="w-3 h-3 text-red-400" />
                          <span>REPORT NOT SUPPORTED</span>
                        </span>
                      ) : (
                        <span className="text-[10px] font-extrabold px-2.5 py-1 rounded-full border font-mono uppercase tracking-wider flex items-center gap-1 bg-amber-500/20 text-amber-300 border-amber-500/40">
                          <Clock className="w-3 h-3 text-amber-400" />
                          <span>UNCONFIRMED CITIZEN REPORT</span>
                        </span>
                      )}
                    </div>

                    {/* Description */}
                    <p className="text-xs text-slate-300 leading-relaxed">
                      {rep.description || 'No additional narrative provided.'}
                    </p>

                    {/* AI Verification Transparency Panel */}
                    <div className="p-2.5 bg-slate-900/90 rounded-xl border border-slate-800/80 space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] font-mono">
                        <span className="text-slate-400 flex items-center gap-1">
                          <Cpu className="w-3.5 h-3.5 text-sky-400" />
                          <span>AI Verification Confidence</span>
                        </span>
                        <strong className={isAiSupported ? 'text-emerald-400' : isSachetCorroborated ? 'text-sky-400' : isAiRejected ? 'text-red-400' : 'text-amber-400'}>
                          {confPct}%
                        </strong>
                      </div>

                      {/* Mini confidence progress bar */}
                      <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                        <div
                          className={`h-full transition-all duration-500 ${
                            isAiSupported ? 'bg-emerald-400' : isSachetCorroborated ? 'bg-sky-400' : isAiRejected ? 'bg-red-500' : 'bg-amber-400'
                          }`}
                          style={{ width: `${confPct}%` }}
                        />
                      </div>

                      {/* Signals summary & corroboration */}
                      {rep.ai_reason && (
                        <p className="text-[10px] text-slate-400 font-mono leading-tight pt-1 border-t border-slate-800/60">
                          {rep.ai_reason}
                        </p>
                      )}

                      {rep.corroborated_sachet_identifier && (
                        <div className="text-[10px] text-sky-400 font-mono flex items-center gap-1 pt-0.5">
                          <ShieldCheck className="w-3 h-3 text-sky-400 shrink-0" />
                          <span>Corroborates NDMA SACHET: {rep.corroborated_sachet_identifier}</span>
                        </div>
                      )}

                      {((rep.corroboration_count && rep.corroboration_count > 1) || (rep.unique_evidence_count && rep.unique_evidence_count > 0)) && (
                        <div className="text-[10px] text-sky-400 font-mono flex items-center gap-1 pt-0.5">
                          <CheckCircle className="w-3 h-3 text-sky-400 shrink-0" />
                          <span>Corroborated by {rep.corroboration_count || 1} independent reports ({rep.unique_evidence_count || (evidence ? 1 : 0)} unique photos)</span>
                        </div>
                      )}

                      {(rep.road_impact || rep.estimated_road_impact) && (rep.road_impact !== 'NONE' || rep.estimated_road_impact) && (
                        <div className="text-[10px] text-amber-300 font-mono flex items-center gap-1 pt-0.5">
                          <Activity className="w-3 h-3 text-amber-400 shrink-0" />
                          <span>Physical Road Impact: {(rep.road_impact || rep.estimated_road_impact || '').replace(/_/g, ' ')}</span>
                        </div>
                      )}

                      {/* Expandable Multi-Signal Checklist */}
                      {rep.signals_checklist && rep.signals_checklist.length > 0 && (
                        <div className="pt-1 border-t border-slate-800/60">
                          <button
                            type="button"
                            onClick={() => toggleChecklist(rep.id!)}
                            className="text-[10px] text-sky-400 hover:text-sky-300 font-mono underline flex items-center gap-1 cursor-pointer"
                          >
                            <Cpu className="w-3 h-3" />
                            <span>{expandedChecklistIds.has(rep.id!) ? 'Hide Multi-Signal Checklist' : 'View Multi-Signal Checklist'}</span>
                          </button>
                          {expandedChecklistIds.has(rep.id!) && (
                            <div className="mt-1.5 p-2 bg-slate-950/90 rounded-lg border border-slate-800 space-y-1 text-[10px] font-mono">
                              {rep.signals_checklist.map((item: any, idx: number) => (
                                <div key={idx} className="flex items-start gap-1.5">
                                  {item.status === 'passed' ? (
                                    <span className="text-emerald-400 font-bold shrink-0">✓</span>
                                  ) : item.status === 'failed' ? (
                                    <span className="text-red-400 font-bold shrink-0">✕</span>
                                  ) : (
                                    <span className="text-slate-400 font-bold shrink-0">○</span>
                                  )}
                                  <div>
                                    <strong className={item.status === 'passed' ? 'text-emerald-300' : item.status === 'failed' ? 'text-red-300' : 'text-slate-300'}>
                                      {item.label}:
                                    </strong>{' '}
                                    <span className="text-slate-400">{item.detail}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Evidence Photo Preview or Neutral Badge */}
                    <div className="pt-1">
                      {evidence ? (
                        <div className="flex items-center gap-3">
                          <div
                            onClick={() =>
                              setLightboxImage({
                                url: evidence.startsWith('http') || evidence.startsWith('/') ? evidence : `/${evidence}`,
                                caption: rep.description,
                                location: rep.location_name
                              })
                            }
                            className="relative group cursor-pointer rounded-lg overflow-hidden border border-slate-700 bg-slate-900 w-24 h-16 shrink-0"
                          >
                            <img
                              src={evidence.startsWith('http') || evidence.startsWith('/') ? evidence : `/${evidence}`}
                              alt="Evidence"
                              onError={(e) => {
                                (e.target as HTMLElement).style.display = 'none';
                              }}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                            />
                            <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <ZoomIn className="w-4 h-4 text-white" />
                            </div>
                          </div>
                          <div className="text-[11px] text-slate-400">
                            <span className="font-semibold text-slate-200 block">Field Evidence Photo Uploaded</span>
                            <button
                              type="button"
                              onClick={() =>
                                setLightboxImage({
                                  url: evidence.startsWith('http') || evidence.startsWith('/') ? evidence : `/${evidence}`,
                                  caption: rep.description,
                                  location: rep.location_name
                                })
                              }
                              className="text-sky-400 hover:text-sky-300 text-[10px] underline font-medium cursor-pointer"
                            >
                              Click to view photo in lightbox
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800/60 border border-slate-700/50 text-[11px] text-slate-400">
                          <CameraOff className="w-3.5 h-3.5 text-slate-500" />
                          <span>No evidence photo provided</span>
                        </div>
                      )}
                    </div>

                    {/* Coordinates & Metadata */}
                    <div className="pt-2 border-t border-slate-800/80 text-[11px] text-slate-400 flex flex-wrap items-center justify-between gap-2 font-mono">
                      <span>
                        Coords: <strong className="text-slate-300">{Number(rep.latitude).toFixed(4)}, {Number(rep.longitude).toFixed(4)}</strong>
                      </span>
                      <span>
                        By: <strong className="text-slate-300 font-sans">{rep.reporter_name || rep.reported_by || 'Citizen'}</strong>
                        {rep.reporter_phone ? ` (${maskPhone(rep.reporter_phone)})` : ''}
                      </span>
                      <span>
                        {rep.created_at ? new Date(rep.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                      </span>
                    </div>

                    {/* Action controls: Re-Verify and Operator Overrides */}
                    <div className="pt-2 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2">
                      <button
                        type="button"
                        disabled={verifyingId === rep.id}
                        onClick={() => handleReverify(rep.id!)}
                        className="flex items-center gap-1 text-[11px] text-sky-400 hover:text-sky-300 px-2 py-1 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 font-semibold cursor-pointer disabled:opacity-50"
                        title="Re-run AI verification engine with live corroboration and active SACHET alerts"
                      >
                        <RotateCw className={`w-3 h-3 ${verifyingId === rep.id ? 'animate-spin' : ''}`} />
                        <span>Re-Verify with AI</span>
                      </button>

                      {isOperator && rep.id && (
                        <div className="flex items-center gap-2">
                          {!isAiSupported && (
                            <button
                              disabled={isModerating}
                              onClick={() => handleApprove(rep.id!)}
                              className="flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-all disabled:opacity-50 cursor-pointer"
                              title="Manual Operator Override: Force Approve"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Override Approve</span>
                            </button>
                          )}
                          {!isAiRejected && (
                            <button
                              disabled={isModerating}
                              onClick={() => handleOpenRejectModal(rep.id!)}
                              className="flex items-center gap-1 px-2.5 py-1 bg-amber-700 hover:bg-amber-600 text-white rounded-lg text-xs font-bold transition-all disabled:opacity-50 cursor-pointer"
                              title="Manual Operator Override: Force Reject"
                            >
                              <X className="w-3.5 h-3.5" />
                              <span>Override Reject</span>
                            </button>
                          )}
                          <button
                            disabled={isModerating}
                            onClick={() => handleDelete(rep.id!)}
                            className="p-1 text-slate-500 hover:text-red-400 rounded transition-colors cursor-pointer"
                            title="Delete Report Permanently"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Lightbox Modal for Full Evidence Photo */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setLightboxImage(null)}
        >
          <div
            className="relative max-w-2xl w-full bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl space-y-3 p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2">
                <Camera className="w-4 h-4 text-sky-400" />
                <span className="font-bold text-white text-sm">Field Evidence Photo</span>
              </div>
              <button
                onClick={() => setLightboxImage(null)}
                className="p-1 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="max-h-[65vh] overflow-hidden rounded-xl bg-black flex items-center justify-center">
              <img
                src={lightboxImage.url}
                alt="Evidence Full View"
                className="max-h-[65vh] w-auto object-contain"
              />
            </div>

            <div className="text-xs text-slate-300">
              <p className="font-bold text-white">{lightboxImage.location}</p>
              <p className="text-slate-400 text-[11px] mt-0.5">{lightboxImage.caption}</p>
            </div>
          </div>
        </div>
      )}

      {/* Operator Reject Reason Modal */}
      {rejectModalId && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setRejectModalId(null)}
        >
          <div
            className="relative max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2 text-red-400 font-bold text-sm">
                <AlertCircle className="w-4 h-4" />
                <span>Manual Operator Rejection Override</span>
              </div>
              <button
                onClick={() => setRejectModalId(null)}
                className="p-1 text-slate-400 hover:text-white rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-300">
              Provide an operational rationale for overriding this citizen report:
            </p>

            <textarea
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. Cleared by BRO highway maintenance team at 11:30 AM..."
              className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-red-500"
            />

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setRejectModalId(null)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-white cursor-pointer"
              >
                Cancel
              </button>
              <button
                disabled={isModerating}
                onClick={handleConfirmReject}
                className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-bold transition-all disabled:opacity-50 cursor-pointer"
              >
                {isModerating ? 'Saving...' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pick on Map Interactive Modal */}
      {showMapPicker && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6"
          onClick={() => setShowMapPicker(false)}
        >
          <div
            className="relative max-w-4xl w-full bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden shadow-2xl flex flex-col space-y-0"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 bg-slate-950/80 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  <MapPin className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-white text-sm sm:text-base">Pick Incident Location on Map</h3>
                  <p className="text-[11px] text-slate-400">Click anywhere on the map to pinpoint the exact disaster coordinates.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowMapPicker(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Map Container with Click Capture & Marker */}
            <div className="relative w-full h-[440px] bg-slate-950">
              {/* Floating Instruction Banner */}
              <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] pointer-events-none bg-slate-900/95 backdrop-blur-md text-amber-300 border border-amber-500/60 px-4 py-2 rounded-full shadow-2xl flex items-center gap-2 text-xs font-bold font-mono">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                <span>CLICK ANYWHERE ON MAP TO PINPOINT INCIDENT</span>
              </div>

              <MapContainer
                center={[pickerLat || 26.1445, pickerLng || 91.7362]}
                zoom={pickerLat ? 12 : 7}
                style={{ height: '100%', width: '100%' }}
              >
                <TileLayer
                  url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                />
                <MapClickCapture onPick={(lat, lng) => {
                  setPickerLat(lat);
                  setPickerLng(lng);
                }} />
                {pickerLat !== null && pickerLng !== null && (
                  <Marker position={[pickerLat, pickerLng]} icon={createMapPickerIcon()} />
                )}
              </MapContainer>
            </div>

            {/* Modal Footer with Telemetry and Actions */}
            <div className="p-4 bg-slate-950/90 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="text-xs text-slate-300 font-mono flex items-center gap-3">
                  <span>Lat: <strong className="text-white font-bold">{pickerLat !== null ? pickerLat.toFixed(6) : '—'}</strong></span>
                  <span>Lon: <strong className="text-white font-bold">{pickerLng !== null ? pickerLng.toFixed(6) : '—'}</strong></span>
                </div>
                {pickerLat !== null && pickerLng !== null && (
                  <div className="text-[10px] font-mono">
                    {(() => {
                      const sc = getLocationScope(pickerLat, pickerLng);
                      return sc ? (
                        <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${sc.color}`}>
                          {sc.label}
                        </span>
                      ) : null;
                    })()}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowMapPicker(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={pickerLat === null || pickerLng === null}
                  onClick={handleConfirmMapPicker}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-lg disabled:opacity-50 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>Confirm Coordinates</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
