import React, { useState, useEffect } from 'react';
import {
  Truck, Warehouse, Route, Sparkles, CheckCircle2,
  DollarSign, Clock, Fuel, ShieldCheck, Plus,
  Activity, ArrowRight, RefreshCw, AlertCircle
} from 'lucide-react';
import { api } from '../services/api';
import { useStateFilter } from '../context/StateFilterContext';
import { VehicleData, ShipmentData, WarehouseData } from '../types';

export const LogisticsOptimizationPage: React.FC = () => {
  const { selectedState } = useStateFilter();
  const [fleet, setFleet] = useState<VehicleData[]>([]);
  const [shipments, setShipments] = useState<ShipmentData[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseData[]>([]);
  const [loading, setLoading] = useState(true);

  // New Shipment Modal state
  const [showNewShipmentModal, setShowNewShipmentModal] = useState(false);
  const [newOrigin, setNewOrigin] = useState('Guwahati');
  const [newDest, setNewDest] = useState('Imphal');
  const [newCargo, setNewCargo] = useState('Emergency Medical Supplies');
  const [newWeight, setNewWeight] = useState(12.0);

  // AI Recommendation application feedback
  const [aiApplied, setAiApplied] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  const fetchLogisticsData = async () => {
    setLoading(true);
    try {
      const [fleetRes, shipRes, whRes] = await Promise.all([
        api.getFleet(),
        api.getShipments(),
        api.getWarehouses(selectedState)
      ]);
      setFleet(fleetRes);
      setShipments(shipRes);
      setWarehouses(whRes);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogisticsData();
  }, [selectedState]);

  const handleApplyAI = async () => {
    setAiLoading(true);
    try {
      await api.applyLogisticsOptimization("reroute_barak_axis");
      setAiApplied(true);
      fetchLogisticsData();
    } catch (err) {
      console.error(err);
    } finally {
      setAiLoading(false);
    }
  };

  const handleCreateShipmentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createShipment({
        origin: newOrigin,
        destination: newDest,
        cargo_type: newCargo,
        cargo_weight: newWeight
      });
      setShowNewShipmentModal(false);
      fetchLogisticsData();
    } catch (err) {
      console.error(err);
    }
  };

  // Fleet stats
  const activeTrucks = fleet.filter(v => v.status === 'In Transit').length;
  const availableTrucks = fleet.filter(v => v.status === 'Available').length;
  const totalCapacity = fleet.reduce((acc, v) => acc + v.capacity, 0);

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Truck className="w-4 h-4 text-indigo-400" />
            <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest font-mono">
              Autonomous Freight Control Tower
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Smart Logistics & Fleet Optimization
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Real-time fleet tracking, multi-modal cold chains, active shipments, and AI freight dispatch.
          </p>
        </div>

        <button
          onClick={() => setShowNewShipmentModal(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-slate-950 font-bold rounded-xl text-xs transition-all shadow-lg glow-sky"
        >
          <Plus className="w-4 h-4" />
          <span>Dispatch New Shipment</span>
        </button>
      </div>

      {/* Actionable AI Optimization Recommendation Panel */}
      <div className="glass-panel rounded-2xl p-5 border-2 border-indigo-500/60 bg-gradient-to-r from-indigo-950/40 via-slate-900 to-sky-950/40 shadow-2xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/40 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Sparkles className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                  AI Freight Optimization Engine
                </span>
                <span className="text-xs text-emerald-400 font-semibold">Active Fleet Telemetry</span>
              </div>
              <h3 className="text-base font-bold text-white mt-1">
                «Redirect 3 priority freight convoys through Mahasadak (NH-27) instead of NH-6»
              </h3>
              <p className="text-xs text-slate-300 mt-0.5 max-w-2xl">
                Avoids active landslide obstruction along the Jowai-Sonapur mountain corridor while preserving cold-chain temperature integrity.
              </p>
            </div>
          </div>

          <button
            onClick={handleApplyAI}
            disabled={aiApplied || aiLoading}
            className={`px-5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all shadow-lg flex-shrink-0 ${
              aiApplied
                ? 'bg-emerald-500 text-slate-950 glow-emerald'
                : 'bg-indigo-500 hover:bg-indigo-400 text-slate-950'
            }`}
          >
            {aiApplied ? (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>AI Recommendation Applied</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>{aiLoading ? "Optimizing..." : "Apply AI Recommendation"}</span>
              </>
            )}
          </button>
        </div>

        {/* Quantified Impact Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-800">
          <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800 text-xs">
            <span className="text-slate-400">Delay Risk Reduction:</span>
            <div className="text-base font-extrabold text-emerald-400 mt-0.5">-34% Delay Probability</div>
          </div>
          <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800 text-xs">
            <span className="text-slate-400">Estimated Fuel & Toll Savings:</span>
            <div className="text-base font-extrabold text-sky-400 mt-0.5">₹8,400 per trip</div>
          </div>
          <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800 text-xs">
            <span className="text-slate-400">Transit Duration Saved:</span>
            <div className="text-base font-extrabold text-amber-400 mt-0.5">2.3 Hours / Truck</div>
          </div>
          <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800 text-xs">
            <span className="text-slate-400">Carbon & Fuel Efficiency:</span>
            <div className="text-base font-extrabold text-teal-400 mt-0.5">18% Lower Fuel Burn</div>
          </div>
        </div>
      </div>

      {/* Fleet & Warehouse KPI Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="glass-panel p-4 rounded-2xl border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold">Active Fleet Vehicles</span>
            <Truck className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-2xl font-extrabold text-white">{activeTrucks} <span className="text-xs font-normal text-slate-400">in transit</span></div>
          <p className="text-[11px] text-emerald-400 mt-1">{availableTrucks} Available for Immediate Dispatch</p>
        </div>

        <div className="glass-panel p-4 rounded-2xl border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold">Total Fleet Freight Capacity</span>
            <Activity className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-extrabold text-indigo-300">{totalCapacity} <span className="text-xs font-normal text-slate-400">Metric Tonnes</span></div>
          <p className="text-[11px] text-slate-400 mt-1">Multi-Axle + 4x4 Hill Carriers</p>
        </div>

        <div className="glass-panel p-4 rounded-2xl border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold">Regional Storage Facilities</span>
            <Warehouse className="w-4 h-4 text-teal-400" />
          </div>
          <div className="text-2xl font-extrabold text-teal-300">{warehouses.length} <span className="text-xs font-normal text-slate-400">Centers</span></div>
          <p className="text-[11px] text-teal-400 mt-1">{warehouses.filter(w => w.cold_storage).length} Solar Cold Chain Hubs Active</p>
        </div>
      </div>

      {/* Active Shipments Table */}
      <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-sm text-white">Active Freight Consignments & Tracking ({shipments.length})</h3>
            <p className="text-xs text-slate-400">Real-time status, ETA, route conditions, and cost accounting</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-900 text-slate-400 border-b border-slate-800 uppercase font-semibold text-[10px]">
              <tr>
                <th className="p-3">Shipment ID</th>
                <th className="p-3">Origin ➔ Destination</th>
                <th className="p-3">Cargo Type</th>
                <th className="p-3">Weight</th>
                <th className="p-3">ETA</th>
                <th className="p-3">Estimated Cost</th>
                <th className="p-3">Status</th>
                <th className="p-3">Risk Assessment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {shipments.map((s) => (
                <tr key={s.id} className="hover:bg-slate-900/60 transition-colors">
                  <td className="p-3 font-mono font-bold text-sky-400">{s.shipment_number}</td>
                  <td className="p-3 font-semibold text-white">
                    {s.origin} <span className="text-slate-500 font-normal">➔</span> {s.destination}
                  </td>
                  <td className="p-3 text-slate-300">{s.cargo_type}</td>
                  <td className="p-3 font-mono">{s.cargo_weight} T</td>
                  <td className="p-3 font-medium text-amber-300">{s.eta}</td>
                  <td className="p-3 font-mono">₹{s.estimated_cost.toLocaleString()}</td>
                  <td className="p-3">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      s.status === 'Rerouted'
                        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                        : s.status === 'In Transit'
                        ? 'bg-sky-500/20 text-sky-400 border-sky-500/40'
                        : 'bg-slate-800 text-slate-400 border-slate-700'
                    }`}>
                      {s.status}
                    </span>
                  </td>
                  <td className="p-3">
                    <span className={`text-[11px] font-medium ${
                      s.risk_level.includes('High') || s.risk_level.includes('Alert')
                        ? 'text-red-400'
                        : 'text-emerald-400'
                    }`}>
                      {s.risk_level}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Warehouses & Cold Chain Grid */}
      <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-4">
        <h3 className="font-bold text-sm text-white">Regional Warehouse & Cold Storage Network</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {warehouses.map((wh) => {
            const fillPct = Math.round((wh.current_inventory / wh.capacity) * 100);
            return (
              <div key={wh.id} className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    wh.cold_storage ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30' : 'bg-slate-800 text-slate-300'
                  }`}>
                    {wh.cold_storage ? "❄️ Grade-A Cold Storage" : "Dry Warehouse"}
                  </span>
                  <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-medium">
                    {wh.status}
                  </span>
                </div>

                <h4 className="font-bold text-white text-sm">{wh.name}</h4>
                <p className="text-slate-400 text-[11px]">{wh.district}, {wh.state}</p>

                <div className="space-y-1 pt-1">
                  <div className="flex justify-between text-slate-400 text-[11px]">
                    <span>Capacity Filled:</span>
                    <strong className="text-white">{wh.current_inventory} / {wh.capacity} MT ({fillPct}%)</strong>
                  </div>
                  <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${fillPct > 90 ? 'bg-red-500' : fillPct > 70 ? 'bg-amber-500' : 'bg-teal-500'}`}
                      style={{ width: `${fillPct}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* New Shipment Modal */}
      {showNewShipmentModal && (
        <div className="fixed inset-0 z-[2500] flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-6 text-xs space-y-4">
            <h3 className="font-bold text-base text-white">Create Freight Shipment</h3>

            <form onSubmit={handleCreateShipmentSubmit} className="space-y-3">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Origin Hub</label>
                <input
                  type="text"
                  value={newOrigin}
                  onChange={(e) => setNewOrigin(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Destination</label>
                <input
                  type="text"
                  value={newDest}
                  onChange={(e) => setNewDest(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Cargo Description</label>
                <input
                  type="text"
                  value={newCargo}
                  onChange={(e) => setNewCargo(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Weight (Tonnes)</label>
                <input
                  type="number"
                  min="1"
                  max="40"
                  value={newWeight}
                  onChange={(e) => setNewWeight(parseFloat(e.target.value) || 10)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewShipmentModal(false)}
                  className="flex-1 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 font-bold text-slate-950"
                >
                  Confirm Dispatch
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
