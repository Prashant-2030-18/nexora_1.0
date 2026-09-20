import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Layers, MapPin, Warehouse, AlertTriangle, ShieldCheck,
  Search, ArrowRight, Route, Compass, Info, Mountain, Globe,
  ShieldAlert, ExternalLink, Radio, CheckCircle2
} from 'lucide-react';
import { api } from '../services/api';
import { useStateFilter } from '../context/StateFilterContext';
import { useDisasters } from '../context/DisasterContext';
import { GisMap } from '../components/GisMap';
import { DistrictData, LogisticsHubData, WarehouseData, IncidentData } from '../types';

export const GisMapPage: React.FC = () => {
  const { selectedState } = useStateFilter();
  const { disasters, totalActiveDisasters, refreshDisasters, isRefreshing } = useDisasters();
  const navigate = useNavigate();
  const location = useLocation();

  const searchParams = new URLSearchParams(location.search);
  const autoFocusParam = searchParams.get('focus') === 'true' || searchParams.get('layer') === 'disasters';

  const [districts, setDistricts] = useState<DistrictData[]>([]);
  const [hubs, setHubs] = useState<LogisticsHubData[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseData[]>([]);
  const [incidents, setIncidents] = useState<IncidentData[]>([]);
  const [selectedDisasterId, setSelectedDisasterId] = useState<number | string | null>(null);

  const [inspectorTab, setInspectorTab] = useState<'disasters' | 'districts'>('disasters');
  const [selectedDistrict, setSelectedDistrict] = useState<DistrictData | null>(null);
  const [searchDistrict, setSearchDistrict] = useState('');
  const [searchDisaster, setSearchDisaster] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (disasters.length > 0 && !selectedDisasterId) {
      setSelectedDisasterId(disasters[0].id);
    }
  }, [disasters, selectedDisasterId]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [distRes, hubRes, whRes, incRes] = await Promise.all([
          api.getDistricts(selectedState),
          api.getLogisticsHubs(selectedState),
          api.getWarehouses(selectedState),
          api.getIncidents(selectedState)
        ]);
        setDistricts(distRes);
        setHubs(hubRes);
        setWarehouses(whRes);
        setIncidents(incRes);
        if (distRes.length > 0 && !selectedDistrict) {
          setSelectedDistrict(distRes[0]);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [selectedState]);

  const filteredDistricts = districts.filter(d =>
    d.name.toLowerCase().includes(searchDistrict.toLowerCase())
  );

  const filteredDisasterList = disasters.filter(d =>
    (d.headline || d.event || '').toLowerCase().includes(searchDisaster.toLowerCase()) ||
    (d.area_description || '').toLowerCase().includes(searchDisaster.toLowerCase())
  );

  const selectedDisaster = disasters.find(
    d => String(d.id) === String(selectedDisasterId) || String(d.identifier) === String(selectedDisasterId)
  );

  return (
    <div className="space-y-4 pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"></span>
            <span className="text-xs font-bold text-sky-400 uppercase tracking-widest font-mono">
              Multi-Layer GIS Spatial Intelligence
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
            NER Infrastructure, Logistics & Disaster GIS Map
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Single Source of Truth: {totalActiveDisasters} active NDMA SACHET disaster hazards & logistics infrastructure
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => navigate('/routes')}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold rounded-xl text-xs transition-colors shadow-md cursor-pointer"
          >
            <Route className="w-3.5 h-3.5" />
            <span>Open Route Planner</span>
          </button>
        </div>
      </div>

      {/* Main Grid: Left Map, Right Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-8">
          <GisMap
            districts={districts}
            hubs={hubs}
            warehouses={warehouses}
            incidents={incidents}
            disasters={disasters}
            selectedDisasterId={selectedDisasterId}
            autoFitDisasters={autoFocusParam}
            loading={loading}
            height="640px"
            center={selectedDistrict ? [selectedDistrict.latitude, selectedDistrict.longitude] : [26.2006, 92.9376]}
            zoom={selectedDistrict ? 8 : 7}
            onDistrictSelect={(d) => {
              setSelectedDistrict(d);
              setInspectorTab('districts');
            }}
            onDisasterSelect={(d) => {
              setSelectedDisasterId(d.id);
              setInspectorTab('disasters');
            }}
          />
        </div>

        {/* Right Inspector Panel */}
        <div className="lg:col-span-4 space-y-4">
          {/* Tab Switcher: Disasters vs Districts */}
          <div className="flex rounded-xl bg-slate-900/90 p-1 border border-slate-800 text-xs font-semibold">
            <button
              onClick={() => setInspectorTab('disasters')}
              className={`flex-1 py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-colors ${
                inspectorTab === 'disasters'
                  ? 'bg-red-600 text-white font-bold shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Active Disasters ({totalActiveDisasters})</span>
            </button>
            <button
              onClick={() => setInspectorTab('districts')}
              className={`flex-1 py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-colors ${
                inspectorTab === 'districts'
                  ? 'bg-sky-500 text-slate-950 font-bold shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Compass className="w-3.5 h-3.5" />
              <span>Districts ({districts.length})</span>
            </button>
          </div>

          {inspectorTab === 'disasters' ? (
            /* Active Disasters Inspector */
            <div className="glass-panel p-4 rounded-2xl border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-sm text-white flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                  <span>Disaster Inspector</span>
                </h3>
                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-800 px-1.5 py-0.5 rounded">
                  NDMA SACHET
                </span>
              </div>

              {/* Search disasters */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchDisaster}
                  onChange={(e) => setSearchDisaster(e.target.value)}
                  placeholder="Filter active alerts by area or type..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-red-500"
                />
              </div>

              {/* Selected Disaster Details Card */}
              {selectedDisaster ? (
                <div className="space-y-2.5 pt-2 border-t border-slate-800">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/40 uppercase font-mono">
                        {selectedDisaster.event || selectedDisaster.disaster_type}
                      </span>
                      <h4 className="font-bold text-sm text-white mt-1 leading-snug">
                        {selectedDisaster.headline || selectedDisaster.event}
                      </h4>
                    </div>
                    <span className="text-[10px] font-mono font-bold text-red-400 bg-red-950/80 border border-red-800 px-2 py-0.5 rounded uppercase shrink-0">
                      {selectedDisaster.severity}
                    </span>
                  </div>

                  {selectedDisaster.area_description && (
                    <div className="bg-slate-900/90 p-2 rounded-xl border border-slate-800 text-xs text-slate-300">
                      <span className="text-slate-400 font-semibold">Area: </span>
                      <span>{selectedDisaster.area_description}</span>
                    </div>
                  )}

                  {selectedDisaster.description && (
                    <p className="text-[11px] text-slate-300 max-h-24 overflow-y-auto leading-relaxed scrollbar-thin bg-slate-900/50 p-2 rounded-xl border border-slate-800/80">
                      {selectedDisaster.description}
                    </p>
                  )}

                  <div className="grid grid-cols-2 gap-1.5 text-[10px] font-mono text-slate-400 bg-slate-900/90 p-2 rounded-xl border border-slate-800">
                    <div>Urgency: <strong className="text-slate-200">{selectedDisaster.urgency || 'Unknown'}</strong></div>
                    <div>Certainty: <strong className="text-slate-200">{selectedDisaster.certainty || 'Unknown'}</strong></div>
                    {selectedDisaster.sent_at && (
                      <div className="col-span-2 text-slate-400">
                        Issued: <span className="text-slate-200">{new Date(selectedDisaster.sent_at).toLocaleString()}</span>
                      </div>
                    )}
                  </div>

                  <div className="pt-1 flex items-center justify-between">
                    <a
                      href={
                        selectedDisaster.source_url ||
                        `https://sachet.ndma.gov.in/cap_public_website/FetchXMLFile?identifier=${selectedDisaster.identifier}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-sky-400 hover:text-sky-300 hover:underline flex items-center gap-1 font-bold"
                    >
                      <span>Official NDMA Feed</span>
                      <ExternalLink size={12} />
                    </a>

                    <button
                      onClick={() => navigate('/routes')}
                      className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl text-xs transition-colors flex items-center gap-1"
                    >
                      <span>Evaluate Bypass</span>
                      <ArrowRight size={12} />
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-400 py-3 text-center">
                  Click any disaster marker on the map to inspect.
                </p>
              )}

              {/* Scrollable list of active alerts */}
              <div className="pt-2 border-t border-slate-800 space-y-1.5 max-h-56 overflow-y-auto scrollbar-thin">
                <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">
                  All Active Alerts ({filteredDisasterList.length})
                </h5>
                {filteredDisasterList.map((al) => (
                  <div
                    key={al.id || al.identifier}
                    onClick={() => setSelectedDisasterId(al.id)}
                    className={`p-2 rounded-xl cursor-pointer text-xs flex items-center justify-between gap-2 transition-colors border ${
                      selectedDisasterId === al.id
                        ? 'bg-red-950/80 border-red-500 text-white font-semibold'
                        : 'bg-slate-900/60 hover:bg-slate-800 border-transparent text-slate-300'
                    }`}
                  >
                    <div className="truncate">
                      <div className="font-semibold truncate">{al.headline || al.event}</div>
                      <div className="text-[10px] text-slate-400 truncate">{al.area_description || 'Region'}</div>
                    </div>
                    <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-amber-400 shrink-0 uppercase font-bold">
                      {al.severity}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* District Inspector Panel */
            <div className="glass-panel p-4 rounded-2xl border border-slate-800 space-y-3">
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                <Compass className="w-4 h-4 text-emerald-400" />
                <span>District Inspector</span>
              </h3>

              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchDistrict}
                  onChange={(e) => setSearchDistrict(e.target.value)}
                  placeholder="Find district on map..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
                />
              </div>

              {selectedDistrict ? (
                <div className="space-y-3 pt-2 border-t border-slate-800">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-base text-white">{selectedDistrict.name}</h4>
                    <span
                      className={`text-xs font-bold px-2 py-0.5 rounded-full border ${
                        selectedDistrict.accessibility_score < 45
                          ? 'bg-red-500/20 text-red-400 border-red-500/40'
                          : selectedDistrict.accessibility_score < 60
                          ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                          : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                      }`}
                    >
                      Score: {selectedDistrict.accessibility_score} / 100
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-slate-900/90 p-2 rounded-xl border border-slate-800">
                      <span className="text-slate-400">Road Connectivity:</span>
                      <p className="font-bold text-white text-sm mt-0.5">{selectedDistrict.road_connectivity}/100</p>
                    </div>
                    <div className="bg-slate-900/90 p-2 rounded-xl border border-slate-800">
                      <span className="text-slate-400">Highway Access:</span>
                      <p className="font-bold text-white text-sm mt-0.5">{selectedDistrict.highway_access}/100</p>
                    </div>
                    <div className="bg-slate-900/90 p-2 rounded-xl border border-slate-800">
                      <span className="text-slate-400">Railway Access:</span>
                      <p className="font-bold text-white text-sm mt-0.5">{selectedDistrict.railway_access}/100</p>
                    </div>
                    <div className="bg-slate-900/90 p-2 rounded-xl border border-slate-800">
                      <span className="text-slate-400">Logistics Access:</span>
                      <p className="font-bold text-white text-sm mt-0.5">{selectedDistrict.logistics_access}/100</p>
                    </div>
                  </div>

                  <div className="bg-slate-900/90 p-2.5 rounded-xl border border-slate-800 text-xs">
                    <div className="flex items-center justify-between text-slate-400 mb-1">
                      <span>Disaster Hazard Risk:</span>
                      <strong className="text-amber-400">{selectedDistrict.risk_score} / 100</strong>
                    </div>
                    <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          selectedDistrict.risk_score > 60
                            ? 'bg-red-500'
                            : selectedDistrict.risk_score > 35
                            ? 'bg-amber-500'
                            : 'bg-emerald-500'
                        }`}
                        style={{ width: `${selectedDistrict.risk_score}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => navigate('/routes')}
                      className="flex-1 py-2 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold rounded-xl text-xs transition-colors flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <span>Route To Here</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => navigate('/hub-planner')}
                      className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-xl text-xs transition-colors text-center cursor-pointer"
                    >
                      Siting Hub
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-400 py-4 text-center">
                  Click a district marker on the map to inspect.
                </p>
              )}

              <div className="glass-panel p-4 rounded-2xl border border-slate-800 max-h-56 overflow-y-auto space-y-1.5 scrollbar-thin">
                <h4 className="text-xs font-bold text-slate-300 mb-2">
                  Available Districts ({filteredDistricts.length})
                </h4>
                {filteredDistricts.slice(0, 8).map((d) => (
                  <div
                    key={d.id}
                    onClick={() => setSelectedDistrict(d)}
                    className={`p-2 rounded-xl cursor-pointer text-xs flex items-center justify-between transition-colors ${
                      selectedDistrict?.id === d.id
                        ? 'bg-sky-500/20 border border-sky-500/40 text-white'
                        : 'bg-slate-900/60 hover:bg-slate-800 text-slate-300'
                    }`}
                  >
                    <span>{d.name}</span>
                    <span className="font-mono text-[10px] text-slate-400">{d.accessibility_score}/100</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GisMapPage;
