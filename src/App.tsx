import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Activity, 
  TrainFront, 
  Radio, 
  AlertTriangle, 
  ShieldAlert, 
  FileText, 
  Upload, 
  Filter, 
  ChevronRight,
  Cpu,
  Settings,
  Zap,
  Clock,
  ArrowUpRight,
  Download
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  AreaChart, 
  Area,
  BarChart,
  Bar,
  Cell
} from 'recharts';
import { GlassCard, Badge, cn } from './components/UI';
import { TrainEvent, StationEvent, AnalysisResult } from './types';
import { analyzeKavachData } from './lib/gemini';

// Mock Data Generators
const generateMockData = () => {
  const trains: TrainEvent[] = Array.from({ length: 10 }).map((_, i) => ({
    id: `t-${i}`,
    locoId: `LOCO-${1000 + i}`,
    timestamp: new Date().toISOString(),
    stationId: `STN-${Math.floor(Math.random() * 5) + 1}`,
    speed: Math.floor(Math.random() * 120),
    tcasStatus: Math.random() > 0.8 ? (Math.random() > 0.5 ? 'Downgraded' : 'Override') : 'Normal',
    ebApplied: Math.random() > 0.9,
    ebReason: Math.random() > 0.9 ? 'SPAD Prevention' : undefined,
    overrideAck: Math.random() > 0.5,
    length: 600 + Math.floor(Math.random() * 50),
    expectedLength: 620,
    sosGenerated: Math.random() > 0.95,
    healthScore: 70 + Math.floor(Math.random() * 30),
    faultType: Math.random() > 0.8 ? (Math.random() > 0.5 ? 'Hardware' : 'Software') : 'None'
  }));

  const stations: StationEvent[] = Array.from({ length: 5 }).map((_, i) => ({
    id: `s-${i}`,
    stationId: `STN-${i + 1}`,
    timestamp: new Date().toISOString(),
    rfSignalStrength: 60 + Math.floor(Math.random() * 40),
    commStatus: Math.random() > 0.8 ? 'Intermittent' : 'Online',
    packetLoss: Math.floor(Math.random() * 15),
    hardwareHealth: 80 + Math.floor(Math.random() * 20),
    softwareVersion: 'v2.4.1',
    faultType: Math.random() > 0.8 ? (Math.random() > 0.5 ? 'Hardware' : 'Software') : 'None'
  }));

  return { trains, stations };
};

export default function App() {
  const [activeTab, setActiveTab] = useState<'overview' | 'trains' | 'stations' | 'report'>('overview');
  const [trainData, setTrainData] = useState<TrainEvent[]>([]);
  const [stationData, setStationData] = useState<StationEvent[]>([]);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [filters, setFilters] = useState({ loco: '', station: '' });
  const [uploadStatus, setUploadStatus] = useState<{ type: string, msg: string } | null>(null);

  const parseCSV = (text: string) => {
    const lines = text.split('\n').filter(line => line.trim() !== '');
    if (lines.length < 2) return [];
    const headers = lines[0].split(',').map(h => h.trim());
    return lines.slice(1).map(line => {
      const values = line.split(',').map(v => v.trim());
      const obj: any = {};
      headers.forEach((header, i) => {
        const val = values[i];
        if (val === 'true') obj[header] = true;
        else if (val === 'false') obj[header] = false;
        else if (!isNaN(Number(val)) && val !== '') obj[header] = Number(val);
        else obj[header] = val;
      });
      return obj;
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'TRNMSNMA' | 'RFCOMM') => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadStatus({ type, msg: `Parsing ${file.name}...` });

    try {
      const text = await file.text();
      let parsedData: any[] = [];

      if (file.name.endsWith('.json')) {
        parsedData = JSON.parse(text);
      } else {
        parsedData = parseCSV(text);
      }

      if (type === 'TRNMSNMA') {
        const validatedData: TrainEvent[] = parsedData.map((d, i) => ({
          id: d.id || `t-${Date.now()}-${i}`,
          locoId: d.locoId || 'Unknown',
          timestamp: d.timestamp || new Date().toISOString(),
          stationId: d.stationId || 'Unknown',
          speed: Number(d.speed) || 0,
          tcasStatus: d.tcasStatus || 'Normal',
          ebApplied: !!d.ebApplied,
          ebReason: d.ebReason,
          overrideAck: !!d.overrideAck,
          length: Number(d.length) || 0,
          expectedLength: Number(d.expectedLength) || 0,
          sosGenerated: !!d.sosGenerated,
          healthScore: Number(d.healthScore) || 100,
          faultType: d.faultType || 'None'
        }));
        setTrainData(validatedData);
      } else {
        const validatedData: StationEvent[] = parsedData.map((d, i) => ({
          id: d.id || `s-${Date.now()}-${i}`,
          stationId: d.stationId || 'Unknown',
          timestamp: d.timestamp || new Date().toISOString(),
          rfSignalStrength: Number(d.rfSignalStrength) || 0,
          commStatus: d.commStatus || 'Online',
          packetLoss: Number(d.packetLoss) || 0,
          hardwareHealth: Number(d.hardwareHealth) || 100,
          softwareVersion: d.softwareVersion || 'v1.0',
          faultType: d.faultType || 'None'
        }));
        setStationData(validatedData);
      }

      setUploadStatus({ type, msg: `Successfully loaded ${parsedData.length} records from ${file.name}` });
      setTimeout(() => setUploadStatus(null), 3000);
    } catch (error) {
      console.error("Parse Error:", error);
      setUploadStatus({ type, msg: `Error parsing ${file.name}. Check format.` });
      setTimeout(() => setUploadStatus(null), 5000);
    }
  };

  const runAIAnalysis = async () => {
    if (trainData.length === 0 || stationData.length === 0) return;
    setIsAnalyzing(true);
    const result = await analyzeKavachData(trainData, stationData);
    setAnalysis(result);
    setIsAnalyzing(false);
  };

  const filteredTrains = trainData.filter(t => 
    t.locoId.toLowerCase().includes(filters.loco.toLowerCase()) &&
    t.stationId.toLowerCase().includes(filters.station.toLowerCase())
  );

  const filteredStations = stationData.filter(s => 
    s.stationId.toLowerCase().includes(filters.station.toLowerCase())
  );

  const uniqueLocos = Array.from(new Set(trainData.map(t => t.locoId))).sort();
  const uniqueStations = Array.from(new Set([...trainData.map(t => t.stationId), ...stationData.map(s => s.stationId)])).sort();

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-8">
      {/* Header */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl font-black tracking-tighter bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
            KAVACH AI DIAGNOSTIC
          </h1>
          <p className="text-slate-400 text-sm font-medium flex items-center gap-2">
            <Activity className="w-4 h-4 text-blue-400" />
            TCAS Real-time Health & Performance Monitoring
          </p>
        </div>
        
        <div className="flex gap-3 relative">
          <label className="cursor-pointer flex items-center gap-2 px-4 py-2 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 rounded-xl transition-all group">
            <input 
              type="file" 
              className="hidden" 
              accept=".csv,.json,.txt"
              onChange={(e) => handleFileUpload(e, 'TRNMSNMA')} 
            />
            <Upload className="w-4 h-4 text-blue-400 group-hover:scale-110 transition-transform" />
            <span className="text-xs font-bold text-blue-400">TRNMSNMA</span>
          </label>

          <label className="cursor-pointer flex items-center gap-2 px-4 py-2 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 rounded-xl transition-all group">
            <input 
              type="file" 
              className="hidden" 
              accept=".csv,.json,.txt"
              onChange={(e) => handleFileUpload(e, 'RFCOMM')} 
            />
            <Upload className="w-4 h-4 text-purple-400 group-hover:scale-110 transition-transform" />
            <span className="text-xs font-bold text-purple-400">RFCOMM</span>
          </label>

          <button 
            onClick={runAIAnalysis}
            disabled={isAnalyzing || trainData.length === 0}
            className={cn(
              "flex items-center gap-2 px-6 py-2 rounded-xl transition-all shadow-lg disabled:opacity-50",
              isAnalyzing ? "bg-slate-700" : "bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 shadow-blue-500/20"
            )}
          >
            <Zap className={cn("w-4 h-4 text-white", isAnalyzing && "animate-spin")} />
            <span className="text-xs font-bold text-white uppercase tracking-widest">
              {isAnalyzing ? 'Processing AI...' : 'AI Diagnose'}
            </span>
          </button>

          <AnimatePresence>
            {uploadStatus && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="absolute -bottom-12 left-0 right-0 flex justify-center"
              >
                <div className="px-4 py-2 bg-emerald-500/20 border border-emerald-500/30 rounded-lg text-[10px] font-bold text-emerald-400 backdrop-blur-md">
                  {uploadStatus.msg}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </header>

      {/* Navigation */}
      <nav className="flex gap-2 p-1 bg-slate-900/50 border border-white/5 rounded-2xl w-fit">
        {[
          { id: 'overview', icon: Activity, label: 'Overview' },
          { id: 'trains', icon: TrainFront, label: 'Train Health' },
          { id: 'stations', icon: Radio, label: 'Station Performance' },
          { id: 'report', icon: FileText, label: 'Technical Report' }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl transition-all text-sm font-semibold",
              activeTab === tab.id 
                ? "bg-white/10 text-white shadow-inner" 
                : "text-slate-500 hover:text-slate-300"
            )}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Main Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.3 }}
        >
          {trainData.length === 0 && stationData.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 space-y-6">
              <div className="relative">
                <div className="absolute inset-0 bg-blue-500/20 blur-3xl rounded-full" />
                <Upload className="w-20 h-20 text-blue-400 relative" />
              </div>
              <div className="text-center space-y-2">
                <h2 className="text-2xl font-bold">No Data Uploaded</h2>
                <p className="text-slate-400 max-w-md">Please upload TRNMSNMA (Train) and RFCOMM (Station) CSV or JSON files to begin dynamic AI analysis.</p>
              </div>
              <div className="flex gap-4">
                <button 
                  onClick={() => {
                    const csv = "locoId,timestamp,stationId,speed,tcasStatus,ebApplied,ebReason,overrideAck,length,expectedLength,sosGenerated,healthScore\nLOCO-1001,2026-03-29T06:00:00Z,STN-1,85,Normal,false,,true,620,620,false,95";
                    const blob = new Blob([csv], { type: 'text/csv' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'TRNMSNMA_Template.csv';
                    a.click();
                  }}
                  className="px-4 py-2 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 rounded-xl text-[10px] font-bold text-blue-400 transition-all"
                >
                  Download TRNMSNMA Template
                </button>
                <button 
                  onClick={() => {
                    const csv = "stationId,timestamp,rfSignalStrength,commStatus,packetLoss,hardwareHealth,softwareVersion\nSTN-1,2026-03-29T06:00:00Z,75,Online,2,98,v2.4.1";
                    const blob = new Blob([csv], { type: 'text/csv' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'RFCOMM_Template.csv';
                    a.click();
                  }}
                  className="px-4 py-2 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 rounded-xl text-[10px] font-bold text-purple-400 transition-all"
                >
                  Download RFCOMM Template
                </button>
              </div>
              <div className="flex gap-4">
                <GlassCard className="p-4 text-xs text-slate-500 max-w-xs">
                  <p className="font-bold text-slate-300 mb-2">Expected TRNMSNMA Columns:</p>
                  <p>locoId, speed, tcasStatus, ebApplied, length, expectedLength, healthScore...</p>
                </GlassCard>
                <GlassCard className="p-4 text-xs text-slate-500 max-w-xs">
                  <p className="font-bold text-slate-300 mb-2">Expected RFCOMM Columns:</p>
                  <p>stationId, rfSignalStrength, commStatus, packetLoss, hardwareHealth...</p>
                </GlassCard>
              </div>
            </div>
          ) : (
            <>
              {activeTab === 'overview' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Stats Grid */}
              <div className="md:col-span-2 grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard title="Active Locos" value={trainData.length} icon={TrainFront} color="blue" />
                <StatCard title="Stations" value={stationData.length} icon={Radio} color="purple" />
                <StatCard title="EB Applied" value={trainData.filter(t => t.ebApplied).length} icon={ShieldAlert} color="red" />
                <StatCard title="SOS Alerts" value={trainData.filter(t => t.sosGenerated).length} icon={AlertTriangle} color="orange" />
              </div>

              {/* AI Insight Card */}
              <GlassCard className="row-span-2 flex flex-col" glow="purple">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-bold flex items-center gap-2">
                    <Zap className="w-5 h-5 text-purple-400" />
                    AI Insights
                  </h3>
                  <Badge variant="success">Live</Badge>
                </div>
                
                <div className="flex-1 space-y-4">
                  {analysis ? (
                    <>
                      <p className="text-sm text-slate-300 leading-relaxed italic">
                        "{analysis.summary}"
                      </p>
                      <div className="space-y-2">
                        <h4 className="text-xs font-bold text-slate-500 uppercase">Key Recommendations</h4>
                        {analysis.recommendations.map((rec, i) => (
                          <div key={i} className="flex gap-2 text-xs text-slate-400">
                            <ChevronRight className="w-3 h-3 text-purple-500 flex-shrink-0" />
                            {rec}
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-50">
                      <Cpu className="w-12 h-12 text-slate-600" />
                      <p className="text-xs text-slate-500">Upload data and run AI Diagnose to see insights here.</p>
                    </div>
                  )}
                </div>
              </GlassCard>

              {/* Charts */}
              <GlassCard className="md:col-span-2 h-[300px]">
                <h3 className="text-sm font-bold text-slate-400 mb-4 uppercase tracking-widest">Signal Strength vs Packet Loss</h3>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={stationData}>
                    <defs>
                      <linearGradient id="colorSignal" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                    <XAxis dataKey="stationId" stroke="#64748b" fontSize={10} />
                    <YAxis stroke="#64748b" fontSize={10} />
                    <Tooltip 
                      contentStyle={{ background: '#0f172a', border: '1px solid #ffffff10', borderRadius: '12px' }}
                      itemStyle={{ fontSize: '12px' }}
                    />
                    <Area type="monotone" dataKey="rfSignalStrength" stroke="#3b82f6" fillOpacity={1} fill="url(#colorSignal)" />
                    <Line type="monotone" dataKey="packetLoss" stroke="#f43f5e" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </GlassCard>

              {/* Critical Events Table */}
              <GlassCard className="md:col-span-3">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Critical Events Log</h3>
                  <div className="flex gap-4">
                    <div className="flex items-center gap-2 text-[10px] text-slate-500">
                      <div className="w-2 h-2 rounded-full bg-red-500" /> EB Applied
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-slate-500">
                      <div className="w-2 h-2 rounded-full bg-yellow-500" /> Downgraded
                    </div>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="text-[10px] text-slate-500 uppercase border-b border-white/5">
                        <th className="pb-3 font-bold">Loco ID</th>
                        <th className="pb-3 font-bold">Event</th>
                        <th className="pb-3 font-bold">Station</th>
                        <th className="pb-3 font-bold">Speed</th>
                        <th className="pb-3 font-bold">Ack Time</th>
                        <th className="pb-3 font-bold">Status</th>
                      </tr>
                    </thead>
                    <tbody className="text-xs">
                      {trainData.filter(t => t.ebApplied || t.tcasStatus !== 'Normal').map((event) => (
                        <tr key={event.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                          <td className="py-4 font-mono font-bold text-blue-400">{event.locoId}</td>
                          <td className="py-4">
                            {event.ebApplied ? (
                              <div className="flex flex-col">
                                <span className="text-red-400 font-bold">Emergency Brake</span>
                                <span className="text-[10px] text-slate-500">{event.ebReason}</span>
                              </div>
                            ) : (
                              <span className="text-slate-300">{event.tcasStatus}</span>
                            )}
                          </td>
                          <td className="py-4 text-slate-400">{event.stationId}</td>
                          <td className="py-4 font-mono">{event.speed} km/h</td>
                          <td className="py-4">
                            {event.overrideAck ? (
                              <Badge variant="success">Within Time</Badge>
                            ) : (
                              <Badge variant="error">Delayed</Badge>
                            )}
                          </td>
                          <td className="py-4">
                            <div className="w-24 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                              <div 
                                className={cn(
                                  "h-full rounded-full",
                                  event.healthScore > 80 ? "bg-emerald-500" : event.healthScore > 50 ? "bg-yellow-500" : "bg-red-500"
                                )}
                                style={{ width: `${event.healthScore}%` }}
                              />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </GlassCard>
            </div>
          )}

          {activeTab === 'trains' && (
            <div className="space-y-6">
              <div className="flex gap-4 mb-6">
                <div className="flex-1 relative">
                  <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                  <select 
                    className="w-full bg-slate-900/50 border border-white/10 rounded-xl py-2 pl-10 pr-4 text-sm focus:outline-none focus:border-blue-500/50 transition-all appearance-none cursor-pointer"
                    value={filters.loco}
                    onChange={(e) => setFilters(prev => ({ ...prev, loco: e.target.value }))}
                  >
                    <option value="">All Loco IDs</option>
                    {uniqueLocos.map(loco => (
                      <option key={loco} value={loco}>{loco}</option>
                    ))}
                  </select>
                </div>
                <div className="flex-1 relative">
                  <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                  <select 
                    className="w-full bg-slate-900/50 border border-white/10 rounded-xl py-2 pl-10 pr-4 text-sm focus:outline-none focus:border-blue-500/50 transition-all appearance-none cursor-pointer"
                    value={filters.station}
                    onChange={(e) => setFilters(prev => ({ ...prev, station: e.target.value }))}
                  >
                    <option value="">All Stations</option>
                    {uniqueStations.map(stn => (
                      <option key={stn} value={stn}>{stn}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredTrains.map((train) => (
                  <GlassCard key={train.id} className="hover:scale-[1.02] transition-transform cursor-pointer group" glow={train.healthScore < 60 ? 'red' : undefined}>
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h4 className="text-xl font-black text-white group-hover:text-blue-400 transition-colors">{train.locoId}</h4>
                        <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">{train.stationId} • {new Date(train.timestamp).toLocaleTimeString()}</p>
                      </div>
                      <Badge variant={train.healthScore > 80 ? 'success' : train.healthScore > 50 ? 'warning' : 'error'}>
                        {train.healthScore}% Health
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-6">
                      <div className="p-3 bg-white/5 rounded-xl">
                        <p className="text-[10px] text-slate-500 uppercase mb-1">Length Var.</p>
                        <p className={cn("text-sm font-bold", Math.abs(train.length - train.expectedLength) > 10 ? "text-red-400" : "text-emerald-400")}>
                          {train.length}m <span className="text-[10px] font-normal opacity-50">({train.length - train.expectedLength}m)</span>
                        </p>
                      </div>
                      <div className="p-3 bg-white/5 rounded-xl">
                        <p className="text-[10px] text-slate-500 uppercase mb-1">Fault Type</p>
                        <p className="text-sm font-bold text-slate-300">{train.faultType}</p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between text-[10px] uppercase font-bold text-slate-500">
                        <span>Speed</span>
                        <span>{train.speed} km/h</span>
                      </div>
                      <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500" style={{ width: `${(train.speed / 120) * 100}%` }} />
                      </div>
                    </div>
                  </GlassCard>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'stations' && (
            <div className="space-y-6">
              <div className="flex gap-4 mb-6">
                <div className="flex-1 relative max-w-md">
                  <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                  <select 
                    className="w-full bg-slate-900/50 border border-white/10 rounded-xl py-2 pl-10 pr-4 text-sm focus:outline-none focus:border-blue-500/50 transition-all appearance-none cursor-pointer"
                    value={filters.station}
                    onChange={(e) => setFilters(prev => ({ ...prev, station: e.target.value }))}
                  >
                    <option value="">All Stations</option>
                    {uniqueStations.map(stn => (
                      <option key={stn} value={stn}>{stn}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {filteredStations.map((station) => (
                <GlassCard key={station.id} className="flex flex-col md:flex-row gap-6">
                  <div className="flex-1 space-y-4">
                    <div className="flex justify-between items-center">
                      <h4 className="text-2xl font-black text-white">{station.stationId}</h4>
                      <Badge variant={station.commStatus === 'Online' ? 'success' : 'warning'}>{station.commStatus}</Badge>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <p className="text-[10px] text-slate-500 uppercase font-bold">RF Signal</p>
                        <div className="flex items-center gap-2">
                          <Radio className="w-4 h-4 text-blue-400" />
                          <span className="text-lg font-bold">-{station.rfSignalStrength} dBm</span>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] text-slate-500 uppercase font-bold">Packet Loss</p>
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-red-400" />
                          <span className="text-lg font-bold">{station.packetLoss}%</span>
                        </div>
                      </div>
                    </div>

                    <div className="pt-4 border-t border-white/5">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-500">Hardware Health</span>
                        <span className="font-bold">{station.hardwareHealth}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-800 rounded-full mt-2 overflow-hidden">
                        <div className="h-full bg-emerald-500" style={{ width: `${station.hardwareHealth}%` }} />
                      </div>
                    </div>
                  </div>

                  <div className="w-full md:w-48 h-32 md:h-auto bg-white/5 rounded-2xl p-4 flex flex-col items-center justify-center text-center">
                    <Settings className="w-8 h-8 text-slate-600 mb-2" />
                    <p className="text-[10px] text-slate-500 uppercase font-bold">Software Version</p>
                    <p className="text-sm font-bold text-blue-400">{station.softwareVersion}</p>
                    <div className="mt-2">
                      <Badge variant={station.faultType === 'Software' ? 'error' : 'default'}>
                        {station.faultType === 'None' ? 'No Fault' : `${station.faultType} Issue`}
                      </Badge>
                    </div>
                  </div>
                </GlassCard>
              ))}
              </div>
            </div>
          )}

          {activeTab === 'report' && (
            <div className="max-w-4xl mx-auto space-y-8">
              <GlassCard className="bg-white text-slate-900 p-12 shadow-2xl space-y-8 relative overflow-hidden">
                {/* ... existing report content ... */}
                {/* Watermark */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-[0.03] pointer-events-none">
                  <TrainFront className="w-96 h-96" />
                </div>

                <div className="flex justify-between items-start border-b-2 border-slate-200 pb-8">
                  <div className="space-y-1">
                    <h2 className="text-2xl font-black uppercase tracking-tighter">Office of ADE/TRO/BL</h2>
                    <p className="text-sm font-bold text-slate-500">Indian Railways • Western Zone</p>
                  </div>
                  <div className="text-right text-xs font-bold text-slate-400">
                    <p>Ref: IR/TCAS/DIAG/2026/084</p>
                    <p>Date: {new Date().toLocaleDateString()}</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <p className="font-bold">To,</p>
                  <p className="font-bold">The Team Lead,</p>
                  <p className="font-bold">Medha Kavach Development Team,</p>
                  <p className="font-bold">Hyderabad, India.</p>
                </div>

                <div className="space-y-6">
                  <p className="font-black text-lg underline decoration-2 underline-offset-4">
                    Subject: Technical Analysis Report on Kavach (TCAS) System Performance and Fault Diagnostics.
                  </p>

                  <p className="leading-relaxed">
                    Based on the detailed analysis of TRNMSNMA and RFCOMM data logs, we have identified several critical issues affecting the operational reliability of the Kavach system in this section.
                  </p>

                  <div className="grid grid-cols-2 gap-8">
                    <div className="space-y-3">
                      <h5 className="font-black text-sm uppercase text-blue-600">Train TCAS Analysis</h5>
                      <ul className="text-sm space-y-2 list-disc pl-4">
                        <li>Loco Health: {trainData.filter(t => t.healthScore > 80).length}/{trainData.length} Optimal</li>
                        <li>EB Events: {trainData.filter(t => t.ebApplied).length} instances recorded.</li>
                        <li>Length Variation: Max deviation of {Math.max(...trainData.map(t => Math.abs(t.length - t.expectedLength)))}m detected.</li>
                      </ul>
                    </div>
                    <div className="space-y-3">
                      <h5 className="font-black text-sm uppercase text-purple-600">Station TCAS Analysis</h5>
                      <ul className="text-sm space-y-2 list-disc pl-4">
                        <li>Signal Integrity: Average strength -{Math.floor(stationData.reduce((acc, s) => acc + s.rfSignalStrength, 0) / stationData.length)} dBm.</li>
                        <li>Packet Loss: Peak loss of {Math.max(...stationData.map(s => s.packetLoss))}% at STN-3.</li>
                        <li>Comm Status: {stationData.filter(s => s.commStatus === 'Online').length} Stations fully operational.</li>
                      </ul>
                    </div>
                  </div>

                  <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
                    <h5 className="font-black text-sm uppercase mb-3">AI Diagnostic Summary</h5>
                    <p className="text-sm italic text-slate-600">
                      {analysis?.summary || "AI analysis pending. Please run diagnostic from dashboard."}
                    </p>
                  </div>

                  <p className="leading-relaxed">
                    It is requested that the Medha Kavach team investigate the software logic for override acknowledgments and hardware sensitivity at STN-3 immediately to prevent further system downgrades.
                  </p>
                </div>

                <div className="pt-12 flex justify-between items-end">
                  <div className="space-y-1">
                    <div className="w-32 h-px bg-slate-900 mb-2" />
                    <p className="font-black text-sm uppercase">ADE/TRO/BL</p>
                    <p className="text-[10px] text-slate-500 font-bold">Authorized Signatory</p>
                  </div>
                  <button className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-bold hover:bg-slate-800 transition-all">
                    <Download className="w-4 h-4" />
                    Export PDF
                  </button>
                </div>
              </GlassCard>

              <GlassCard className="bg-slate-900/80 border-blue-500/20">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-blue-500/20 rounded-xl">
                    <Settings className="w-6 h-6 text-blue-400" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">Developer Note & Deployment</h4>
                    <p className="text-xs text-slate-400">This dashboard is built with React & Tailwind. For Streamlit/Python versions, use the prompt logic from `src/lib/gemini.ts`. For GitHub, initialize a repo and push these source files.</p>
                  </div>
                  <button className="ml-auto px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all">
                    View Source
                  </button>
                </div>
              </GlassCard>
            </div>
          )}
        </>
      )}
    </motion.div>
  </AnimatePresence>
    </div>
  );
}

const StatCard = ({ title, value, icon: Icon, color }: { title: string, value: string | number, icon: any, color: 'blue' | 'purple' | 'red' | 'orange' }) => {
  const colors = {
    blue: "text-blue-400 bg-blue-500/10 border-blue-500/20",
    purple: "text-purple-400 bg-purple-500/10 border-purple-500/20",
    red: "text-red-400 bg-red-500/10 border-red-500/20",
    orange: "text-orange-400 bg-orange-500/10 border-orange-500/20",
  };
  
  return (
    <GlassCard className="flex flex-col justify-between h-32 hover:translate-y-[-4px] transition-all">
      <div className="flex justify-between items-start">
        <div className={cn("p-2 rounded-lg border", colors[color])}>
          <Icon className="w-4 h-4" />
        </div>
        <ArrowUpRight className="w-4 h-4 text-slate-600" />
      </div>
      <div>
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{title}</p>
        <h4 className="text-2xl font-black text-white">{value}</h4>
      </div>
    </GlassCard>
  );
};
