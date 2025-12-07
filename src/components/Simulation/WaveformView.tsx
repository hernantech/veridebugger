import { useMemo, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useSimulationStore, useSelectionStore } from '../../store';
import type { SignalTimeSeries, SignalValue } from '../../types';
import { ArrowRight, ArrowLeft, Radio } from 'lucide-react';
import './WaveformView.css';

const SIGNAL_HEIGHT = 32;
const TIME_SCALE = 8; // pixels per timestep
const LABEL_WIDTH = 140;

const getValueColor = (value: SignalValue): string => {
  switch (value) {
    case 0: return '#64748b';
    case 1: return '#22c55e';
    case 'X': return '#ef4444';
    case 'Z': return '#f59e0b';
    default: return '#64748b';
  }
};

interface WaveformSignalProps {
  signal: SignalTimeSeries;
  currentTimestep: number;
  isSelected: boolean;
  onSelect: () => void;
}

const WaveformSignal = ({ signal, currentTimestep, isSelected, onSelect }: WaveformSignalProps) => {
  const pathD = useMemo(() => {
    const points: string[] = [];
    let lastValue: SignalValue | null = null;

    signal.values.forEach((v, i) => {
      const x = i * TIME_SCALE;
      const y = v.value === 1 ? 4 : v.value === 0 ? SIGNAL_HEIGHT - 8 : SIGNAL_HEIGHT / 2;
      
      if (lastValue !== null && lastValue !== v.value) {
        // Vertical transition
        const lastY = lastValue === 1 ? 4 : lastValue === 0 ? SIGNAL_HEIGHT - 8 : SIGNAL_HEIGHT / 2;
        points.push(`L ${x} ${lastY}`);
        points.push(`L ${x} ${y}`);
      } else if (i === 0) {
        points.push(`M ${x} ${y}`);
      }
      
      points.push(`L ${x + TIME_SCALE} ${y}`);
      lastValue = v.value;
    });

    return points.join(' ').replace('L', 'M');
  }, [signal.values]);

  const currentValue = signal.values[currentTimestep]?.value ?? 'X';

  return (
    <div 
      className={`waveform-signal ${isSelected ? 'waveform-signal--selected' : ''}`}
      onClick={onSelect}
    >
      <div className="waveform-signal__label">
        <span className="waveform-signal__name" title={signal.signalName}>
          {signal.isInput && <ArrowRight size={10} className="waveform-signal__dir waveform-signal__dir--in" />}
          {signal.isOutput && <ArrowLeft size={10} className="waveform-signal__dir waveform-signal__dir--out" />}
          {signal.signalName}
        </span>
        <span 
          className="waveform-signal__value"
          style={{ color: getValueColor(currentValue) }}
        >
          {currentValue}
        </span>
      </div>
      <div className="waveform-signal__wave">
        <svg 
          width={signal.values.length * TIME_SCALE} 
          height={SIGNAL_HEIGHT}
          className="waveform-signal__svg"
        >
          {/* Background grid */}
          {signal.values.map((_, i) => (
            i % 10 === 0 && (
              <line
                key={i}
                x1={i * TIME_SCALE}
                y1={0}
                x2={i * TIME_SCALE}
                y2={SIGNAL_HEIGHT}
                stroke="#e2e8f0"
                strokeWidth={1}
                strokeDasharray="2,2"
              />
            )
          ))}
          
          {/* Waveform path */}
          <path
            d={pathD}
            fill="none"
            stroke={isSelected ? '#3b82f6' : '#1e293b'}
            strokeWidth={isSelected ? 2 : 1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Current timestep indicator */}
          <line
            x1={currentTimestep * TIME_SCALE}
            y1={0}
            x2={currentTimestep * TIME_SCALE}
            y2={SIGNAL_HEIGHT}
            stroke="#3b82f6"
            strokeWidth={2}
            opacity={0.5}
          />

          {/* X/Z value markers */}
          {signal.values.map((v, i) => (
            (v.value === 'X' || v.value === 'Z') && (
              <rect
                key={i}
                x={i * TIME_SCALE}
                y={SIGNAL_HEIGHT / 2 - 6}
                width={TIME_SCALE}
                height={12}
                fill={v.value === 'X' ? '#fecaca' : '#fef3c7'}
                opacity={0.5}
              />
            )
          ))}
        </svg>
      </div>
    </div>
  );
};

const WaveformView = () => {
  const { state: simState, setTimestep } = useSimulationStore();
  const { selectedSignalId, setSelectedSignal } = useSelectionStore();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to follow current timestep
  useEffect(() => {
    if (scrollContainerRef.current && simState) {
      const currentX = simState.currentTimestep * TIME_SCALE;
      const containerWidth = scrollContainerRef.current.clientWidth - LABEL_WIDTH;
      const scrollLeft = scrollContainerRef.current.scrollLeft;
      
      if (currentX > scrollLeft + containerWidth - 100 || currentX < scrollLeft + 100) {
        scrollContainerRef.current.scrollTo({
          left: Math.max(0, currentX - containerWidth / 2),
          behavior: 'smooth',
        });
      }
    }
  }, [simState?.currentTimestep]);

  // Handle timeline click to set timestep
  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!timelineRef.current || !simState) return;
    
    const rect = timelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const timestep = Math.round(x / TIME_SCALE);
    
    if (timestep >= 0 && timestep <= simState.totalTimesteps) {
      setTimestep(timestep);
    }
  };

  if (!simState || simState.signals.length === 0) {
    return (
      <div className="waveform-view waveform-view--empty">
        <Radio size={24} />
        <p>No signals to display</p>
        <span>Run a simulation to see waveforms</span>
      </div>
    );
  }

  const totalWidth = simState.totalTimesteps * TIME_SCALE;

  return (
    <div className="waveform-view">
      <div className="waveform-view__header">
        <h3>Signal Waveforms</h3>
        <span className="waveform-view__time">
          t = {simState.currentTimestep}
        </span>
      </div>

      <div className="waveform-view__container" ref={scrollContainerRef}>
        {/* Timeline ruler */}
        <div 
          className="waveform-view__timeline" 
          ref={timelineRef}
          onClick={handleTimelineClick}
          style={{ width: totalWidth + LABEL_WIDTH }}
        >
          <div className="waveform-view__timeline-label" />
          <div className="waveform-view__timeline-ruler">
            {Array.from({ length: Math.ceil(simState.totalTimesteps / 10) + 1 }).map((_, i) => (
              <div key={i} className="waveform-view__timeline-tick" style={{ left: i * 10 * TIME_SCALE }}>
                <span>{i * 10}</span>
              </div>
            ))}
            <motion.div
              className="waveform-view__timeline-cursor"
              animate={{ left: simState.currentTimestep * TIME_SCALE }}
              transition={{ duration: 0.1 }}
            />
          </div>
        </div>

        {/* Signals */}
        <div className="waveform-view__signals">
          {simState.signals.map((signal) => (
            <WaveformSignal
              key={signal.signalId}
              signal={signal}
              currentTimestep={simState.currentTimestep}
              isSelected={selectedSignalId === signal.signalId}
              onSelect={() => setSelectedSignal(
                selectedSignalId === signal.signalId ? null : signal.signalId
              )}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default WaveformView;

