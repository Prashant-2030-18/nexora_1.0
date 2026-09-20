import React, { useState, useEffect } from 'react';
import {
  X, AlertTriangle, MapPin, Crosshair, ShieldAlert, CheckCircle2,
  Search, Sliders, Send, Radio
} from 'lucide-react';
import { api } from '../services/api';
import { UserDisasterReport } from '../types';
import { useConnectivity } from '../context/ConnectivityContext';
import { savePendingReport, enqueueSyncItem } from '../services/offlineStore';

interface ReportDisasterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newReport: UserDisasterReport) => void;
  selectedCoordinates?: { lat: number; lng: number } | null;
  onActivateMapPick?: () => void;
  isPickingOnMap?: boolean;
}

const DISASTER_TYPES = [
  'Landslide',
  'Flood',
  'Heavy Rainfall',
  'Road Blockage',
  'Bridge Damage',
  'Cyclone / High Winds',
  'Earthquake',
  'Forest Fire',
  'Avalanche',
  'Other Hazard'
];

const SEVERITY_LEVELS = [
  { id: 'LOW', label: 'Low', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' },
  { id: 'MODERATE', label: 'Moderate', color: 'bg-amber-500/20 text-amber-400 border-amber-500/40' },
  { id: 'HIGH', label: 'High', color: 'bg-orange-500/20 text-orange-400 border-orange-500/40' },
  { id: 'CRITICAL', label: 'Critical', color: 'bg-red-500/20 text-red-400 border-red-500/40' }
];

export const ReportDisasterModal: React.FC<ReportDisasterModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  selectedCoordinates,
  onActivateMapPick,
  isPickingOnMap = false
}) => {
  const [disasterType, setDisasterType] = useState('Landslide');
  const [severity, setSeverity] = useState('HIGH');
  const [latitude, setLatitude] = useState<string>('');
  const [longitude, setLongitude] = useState<string>('');
  const [locationName, setLocationName] = useState('');
  const [radiusKm, setRadiusKm] = useState<number>(8);
  const [description, setDescription] = useState('');
  const [reportedBy, setReportedBy] = useState<'User' | 'Operator'>('Operator');
  const [contactInfo, setContactInfo] = useState('');
  const [estimatedRoadImpact, setEstimatedRoadImpact] = useState('Single lane blocked, heavy delay');
  const [evidenceUrl, setEvidenceUrl] = useState('');

  // Geocoding search inside modal
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Status
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const { connectionState } = useConnectivity();
  const isOffline = connectionState === 'OFFLINE' || connectionState === 'RESTORING';

  // Sync selectedCoordinates prop when user clicked on map
  useEffect(() => {
    if (selectedCoordinates) {
      setLatitude(selectedCoordinates.lat.toFixed(5));
      setLongitude(selectedCoordinates.lng.toFixed(5));
      if (!locationName) {
        setLocationName(`Coord (${selectedCoordinates.lat.toFixed(4)}, ${selectedCoordinates.lng.toFixed(4)})`);
      }
    }
  }, [selectedCoordinates]);

  if (!isOpen) return null;

  const handleSearchLocation = async (q: string) => {
    setSearchQuery(q);
    if (!q || q.length < 3) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const results = await api.searchLocations(q, 5);
      setSearchResults(results || []);
    } catch {
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const selectSearchResult = (item: any) => {
    setLatitude(Number(item.latitude).toFixed(5));
    setLongitude(Number(item.longitude).toFixed(5));
    setLocationName(item.display_name.split(',')[0]);
    setSearchQuery('');
    setSearchResults([]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const latNum = parseFloat(latitude);
    const lonNum = parseFloat(longitude);

    if (isNaN(latNum) || isNaN(lonNum)) {
      setErrorMsg('Please specify valid latitude and longitude coordinates.');
      return;
    }

    if (latNum < 20 || latNum > 30 || lonNum < 88 || lonNum > 98) {
      setErrorMsg('Coordinates should be within or near the North Eastern Region (Lat 20-30°N, Lon 88-98°E).');
      return;
    }

    if (!description.trim()) {
      setErrorMsg('Please provide a brief description of the ground situation.');
      return;
    }

    setSubmitting(true);
    const payload = {
      type: disasterType,
      severity,
      latitude: latNum,
      longitude: lonNum,
      location_name: locationName.trim() || `Lat ${latNum.toFixed(4)}, Lon ${lonNum.toFixed(4)}`,
      radiusKm: Number(radiusKm),
      description: description.trim(),
      reportedBy,
      contactInfo: contactInfo.trim() || undefined,
      estimatedRoadImpact: estimatedRoadImpact.trim() || undefined,
      evidenceUrl: evidenceUrl.trim() || undefined
    };

    if (isOffline) {
      try {
        const localId = 'rep_' + Math.random().toString(36).slice(2) + Date.now();
        const idempotencyKey = 'idem_' + Math.random().toString(36).slice(2) + Date.now();
        await savePendingReport({
          localId,
          idempotencyKey,
          timestamp: new Date().toISOString(),
          latitude: latNum,
          longitude: lonNum,
          hazardType: disasterType,
          severity,
          description: description.trim(),
          reporterName: reportedBy,
          status: 'PENDING_SYNC',
          createdAt: new Date().toISOString()
        });
        await enqueueSyncItem({
          queueId: 'q_' + Math.random().toString(36).slice(2),
          entityType: 'CITIZEN_REPORT',
          entityLocalId: localId,
          operation: 'CREATE',
          payload: payload,
          idempotencyKey,
          status: 'PENDING',
          retryCount: 0,
          createdAt: new Date().toISOString()
        });
        setSuccessMsg('REPORT SAVED OFFLINE. Status: PENDING SYNCHRONIZATION. Stored securely on device.');
        setTimeout(() => {
          onClose();
        }, 1500);
      } catch (saveErr) {
        console.error('Offline save error:', saveErr);
        setErrorMsg('Failed to save report offline.');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    try {
      const res = await api.reportUserDisaster(payload);
      setSuccessMsg('Disaster successfully recorded into NEXORA SQLite database.');
      setTimeout(() => {
        onSuccess(res);
        onClose();
      }, 1000);
    } catch (err: any) {
      console.warn('Network report failed, fallback to offline store:', err);
      try {
        const localId = 'rep_' + Math.random().toString(36).slice(2) + Date.now();
        const idempotencyKey = 'idem_' + Math.random().toString(36).slice(2) + Date.now();
        await savePendingReport({
          localId,
          idempotencyKey,
          timestamp: new Date().toISOString(),
          latitude: latNum,
          longitude: lonNum,
          hazardType: disasterType,
          severity,
          description: description.trim(),
          reporterName: reportedBy,
          status: 'PENDING_SYNC',
          createdAt: new Date().toISOString()
        });
        await enqueueSyncItem({
          queueId: 'q_' + Math.random().toString(36).slice(2),
          entityType: 'CITIZEN_REPORT',
          entityLocalId: localId,
          operation: 'CREATE',
          payload: payload,
          idempotencyKey,
          status: 'PENDING',
          retryCount: 0,
          createdAt: new Date().toISOString()
        });
        setSuccessMsg('REPORT SAVED OFFLINE. Status: PENDING SYNCHRONIZATION. Will auto-sync upon reconnection.');
        setTimeout(() => {
          onClose();
        }, 1500);
      } catch {
        setErrorMsg(err.response?.data?.detail || err.message || 'Failed to submit disaster report.');
      }
    } finally {
      setSubmitting(false);
    }
  };


  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden my-8">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/70">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-500/20 text-red-400 border border-red-500/30">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                Report Disaster / Road Hazard
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Citizen & Operator Ground Input
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Ground incident reports integrate immediately with smart routing and AI hazard analysis.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {errorMsg && (
            <div className="p-3 rounded-lg bg-red-500/15 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Type & Severity */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Disaster / Hazard Type *
              </label>
              <select
                value={disasterType}
                onChange={(e) => setDisasterType(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-cyan-500"
              >
                {DISASTER_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Reported By Authority *
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setReportedBy('Operator')}
                  className={`px-3 py-2 rounded-lg text-xs font-medium border text-center transition ${
                    reportedBy === 'Operator'
                      ? 'bg-cyan-600 text-white border-cyan-500 shadow-sm'
                      : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-750'
                  }`}
                >
                  Logistics Operator
                </button>
                <button
                  type="button"
                  onClick={() => setReportedBy('User')}
                  className={`px-3 py-2 rounded-lg text-xs font-medium border text-center transition ${
                    reportedBy === 'User'
                      ? 'bg-amber-600 text-white border-amber-500 shadow-sm'
                      : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-750'
                  }`}
                >
                  Citizen / Driver
                </button>
              </div>
            </div>
          </div>

          {/* Severity Level */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Severity Level *
            </label>
            <div className="grid grid-cols-4 gap-2">
              {SEVERITY_LEVELS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSeverity(s.id)}
                  className={`py-2 px-2 rounded-lg text-xs font-semibold border transition text-center ${
                    severity === s.id
                      ? `${s.color} ring-1 ring-white/20 shadow-md`
                      : 'bg-slate-800/80 text-slate-400 border-slate-700 hover:bg-slate-800'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Location Picker & Coordinates */}
          <div className="p-3.5 rounded-lg bg-slate-800/60 border border-slate-700/80 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-cyan-400" />
                Geographic Coordinates *
              </span>
              {onActivateMapPick && (
                <button
                  type="button"
                  onClick={onActivateMapPick}
                  className={`text-xs px-2.5 py-1 rounded flex items-center gap-1 transition ${
                    isPickingOnMap
                      ? 'bg-amber-500 text-black font-semibold animate-pulse'
                      : 'bg-slate-700 hover:bg-slate-600 text-cyan-300 border border-cyan-500/30'
                  }`}
                >
                  <Crosshair className="w-3 h-3" />
                  {isPickingOnMap ? 'Click anywhere on map...' : 'Pick on Map'}
                </button>
              )}
            </div>

            {/* Location search box */}
            <div className="relative">
              <div className="flex items-center bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5">
                <Search className="w-3.5 h-3.5 text-slate-400 mr-2" />
                <input
                  type="text"
                  placeholder="Search NER town, highway pass, or district..."
                  value={searchQuery}
                  onChange={(e) => handleSearchLocation(e.target.value)}
                  className="bg-transparent text-xs text-white placeholder-slate-500 w-full focus:outline-none"
                />
                {isSearching && (
                  <span className="text-[10px] text-cyan-400 animate-spin">⟳</span>
                )}
              </div>
              {searchResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 z-30 mt-1 bg-slate-900 border border-slate-700 rounded-lg shadow-xl overflow-hidden max-h-40 overflow-y-auto">
                  {searchResults.map((item, idx) => (
                    <div
                      key={idx}
                      onClick={() => selectSearchResult(item)}
                      className="px-3 py-2 text-xs text-slate-200 hover:bg-slate-800 cursor-pointer border-b border-slate-800/60 last:border-0"
                    >
                      <div className="font-medium text-white">{item.display_name.split(',')[0]}</div>
                      <div className="text-[10px] text-slate-400 truncate">{item.display_name}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <label className="block text-[10px] text-slate-400 mb-1">Latitude (°N)</label>
                <input
                  type="number"
                  step="0.0001"
                  placeholder="26.1445"
                  value={latitude}
                  onChange={(e) => setLatitude(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded text-white text-xs focus:outline-none focus:border-cyan-500"
                  required
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 mb-1">Longitude (°E)</label>
                <input
                  type="number"
                  step="0.0001"
                  placeholder="91.7362"
                  value={longitude}
                  onChange={(e) => setLongitude(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded text-white text-xs focus:outline-none focus:border-cyan-500"
                  required
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 mb-1">Location Name</label>
                <input
                  type="text"
                  placeholder="e.g. NH-6 Sonapur Pass"
                  value={locationName}
                  onChange={(e) => setLocationName(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded text-white text-xs focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>
          </div>

          {/* Affected Radius Slider */}
          <div className="p-3.5 rounded-lg bg-slate-800/60 border border-slate-700/80">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                Affected Impact Radius
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={radiusKm}
                  onChange={(e) => setRadiusKm(Math.max(1, Math.min(50, Number(e.target.value))))}
                  className="w-14 px-2 py-0.5 bg-slate-900 border border-slate-700 rounded text-center text-xs font-bold text-cyan-400"
                />
                <span className="text-xs text-slate-400">km buffer</span>
              </div>
            </div>
            <input
              type="range"
              min="1"
              max="50"
              value={radiusKm}
              onChange={(e) => setRadiusKm(Number(e.target.value))}
              className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-400"
            />
            <div className="flex justify-between text-[10px] text-slate-500 mt-1">
              <span>1 km (Localized)</span>
              <span>15 km (Corridor)</span>
              <span>50 km (Regional)</span>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Ground Situation & Details *
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe physical obstruction, water depth, rock debris volume, or alternate clearance ETA..."
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-xs focus:outline-none focus:border-cyan-500 placeholder-slate-500"
              required
            />
          </div>

          {/* Optional Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">
                Estimated Road Impact
              </label>
              <input
                type="text"
                value={estimatedRoadImpact}
                onChange={(e) => setEstimatedRoadImpact(e.target.value)}
                placeholder="e.g. Total closure for heavy trucks"
                className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded text-white text-xs focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">
                Reporter Contact / Unit
              </label>
              <input
                type="text"
                value={contactInfo}
                onChange={(e) => setContactInfo(e.target.value)}
                placeholder="e.g. NHIDCL Sector 4 / Patrol Unit"
                className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded text-white text-xs focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-between pt-3 border-t border-slate-800">
            <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
              <Radio className="w-3.5 h-3.5 text-cyan-400" />
              <span>Broadcasts as <strong className="text-amber-400">USER REPORTED (UNVERIFIED)</strong></span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="px-4 py-2 rounded-lg text-xs font-medium text-slate-300 hover:bg-slate-800 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 rounded-lg text-xs font-semibold bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white shadow-lg transition flex items-center gap-2 disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <span className="animate-spin text-sm">⟳</span>
                    Saving to DB...
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    Submit Disaster Report
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
export default ReportDisasterModal;
