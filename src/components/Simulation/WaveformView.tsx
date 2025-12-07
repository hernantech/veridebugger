/**
 * WaveformView - Displays real VCD waveform data from backend
 */

import { useMemo, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useWaveformStore, useSelectionStore, useViewSettingsStore } from '../../store';
import { ArrowRight, ArrowLeft, Radio, Play, Loader2 } from 'lucide-react';
import './WaveformView.css';

const SIGNAL_HEIGHT = 32;
const LABEL_WIDTH = 160;

const getValueColor = (value: string): string => {
  if (value === '0') return '#64748b';
  if (value === '1') return '#22c55e';
  if (value.toLowerCase() === 'x') return '#ef4444';
  if (value.toLowerCase() === 'z') return '#f59e0b';
  // For multi-bit values, use a different color
  return '#3b82f6';
};

interface WaveformSignalProps {
  name: string;
  width: number;
  values: Array<{ time: number; value: string }>;
  currentTime: number;
  maxTime: number;
  timeScale: number;
  isSelected: boolean;
  onSelect: () => void;
}

const WaveformSignal = ({
  name,
  width,
  values,
  currentTime,
  maxTime,
  timeScale,
  isSelected,
  onSelect,
}: WaveformSignalProps) => {
  const isSingleBit = width === 1;

  // Build path for single-bit signals
  const pathD = useMemo(() => {
    if (!isSingleBit || values.length === 0) return '';

    const points: string[] = [];
    let lastValue: string | null = null;

    // Sort values by time
    const sortedValues = [...values].sort((a, b) => a.time - b.time);

    sortedValues.forEach((v, i) => {
      const x = v.time * timeScale;
      const y = v.value === '1' ? 4 : v.value === '0' ? SIGNAL_HEIGHT - 8 : SIGNAL_HEIGHT / 2;

      if (lastValue !== null && lastValue !== v.value) {
        // Vertical transition
        const lastY = lastValue === '1' ? 4 : lastValue === '0' ? SIGNAL_HEIGHT - 8 : SIGNAL_HEIGHT / 2;
        points.push(`L ${x} ${lastY}`);
        points.push(`L ${x} ${y}`);
      } else if (i === 0) {
        points.push(`M ${x} ${y}`);
      }

      // Extend to next change or end
      const nextTime = sortedValues[i + 1]?.time ?? maxTime;
      points.push(`L ${nextTime * timeScale} ${y}`);
      lastValue = v.value;
    });

    return points.join(' ').replace(/^L/, 'M');
  }, [values, isSingleBit, timeScale, maxTime]);

  // Get current value at currentTime
  const currentValue = useMemo(() => {
    if (values.length === 0) return 'X';
    const sortedValues = [...values].sort((a, b) => a.time - b.time);
    let lastVal = sortedValues[0]?.value ?? 'X';
    for (const v of sortedValues) {
      if (v.time > currentTime) break;
      lastVal = v.value;
    }
    return lastVal;
  }, [values, currentTime]);

  const totalWidth = Math.max(maxTime * timeScale, 800);
  const isInput = name.includes('in') || name.includes('clk') || name.includes('rst');
  const isOutput = name.includes('out') || name.includes('done');

  return (
    <div
      className={`waveform-signal ${isSelected ? 'waveform-signal--selected' : ''}`}
      onClick={onSelect}
    >
      <div className="waveform-signal__label">
        <span className="waveform-signal__name" title={name}>
          {isInput && <ArrowRight size={10} className="waveform-signal__dir waveform-signal__dir--in" />}
          {isOutput && <ArrowLeft size={10} className="waveform-signal__dir waveform-signal__dir--out" />}
          {name}
          {width > 1 && <span className="waveform-signal__width">[{width - 1}:0]</span>}
        </span>
        <span
          className="waveform-signal__value"
          style={{ color: getValueColor(currentValue) }}
        >
          {width > 1 ? `0x${parseInt(currentValue, 2).toString(16).toUpperCase()}` : currentValue}
        </span>
      </div>
      <div className="waveform-signal__wave">
        <svg
          width={totalWidth}
          height={SIGNAL_HEIGHT}
          className="waveform-signal__svg"
        >
          {/* Background grid */}
          {Array.from({ length: Math.ceil(maxTime / 10) + 1 }).map((_, i) => (
            <line
              key={i}
              x1={i * 10 * timeScale}
              y1={0}
              x2={i * 10 * timeScale}
              y2={SIGNAL_HEIGHT}
              stroke="#e2e8f0"
              strokeWidth={1}
              strokeDasharray="2,2"
            />
          ))}

          {isSingleBit ? (
            // Single-bit waveform path
            <path
              d={pathD}
              fill="none"
              stroke={isSelected ? '#3b82f6' : '#1e293b'}
              strokeWidth={isSelected ? 2 : 1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : (
            // Multi-bit: show value boxes
            values.map((v, i) => {
              const nextTime = values[i + 1]?.time ?? maxTime;
              const x = v.time * timeScale;
              const w = (nextTime - v.time) * timeScale;
              return (
                <g key={i}>
                  <rect
                    x={x}
                    y={4}
                    width={w}
                    height={SIGNAL_HEIGHT - 8}
                    fill={isSelected ? '#dbeafe' : '#f1f5f9'}
                    stroke={isSelected ? '#3b82f6' : '#94a3b8'}
                    strokeWidth={1}
                  />
                  {w > 30 && (
                    <text
                      x={x + w / 2}
                      y={SIGNAL_HEIGHT / 2 + 4}
                      textAnchor="middle"
                      fontSize={10}
                      fill="#475569"
                    >
                      {v.value.length > 8 ? '...' : v.value}
                    </text>
                  )}
                </g>
              );
            })
          )}

          {/* Current time indicator */}
          <line
            x1={currentTime * timeScale}
            y1={0}
            x2={currentTime * timeScale}
            y2={SIGNAL_HEIGHT}
            stroke="#3b82f6"
            strokeWidth={2}
            opacity={0.7}
          />
        </svg>
      </div>
    </div>
  );
};

const WaveformView = () => {
  const { waveform, setCurrentTime, runSimulationWithVcd } = useWaveformStore();
  const { selectedSignalName, setSelectedSignal } = useSelectionStore();
  const { timeScale } = useViewSettingsStore();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to follow current time
  useEffect(() => {
    if (scrollContainerRef.current && waveform.maxTime > 0) {
      const currentX = waveform.currentTime * timeScale;
      const containerWidth = scrollContainerRef.current.clientWidth - LABEL_WIDTH;
      const scrollLeft = scrollContainerRef.current.scrollLeft;

      if (currentX > scrollLeft + containerWidth - 100 || currentX < scrollLeft + 100) {
        scrollContainerRef.current.scrollTo({
          left: Math.max(0, currentX - containerWidth / 2),
          behavior: 'smooth',
        });
      }
    }
  }, [waveform.currentTime, timeScale]);

  // Handle timeline click to set time
  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!timelineRef.current || waveform.maxTime === 0) return;

    const rect = timelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const time = Math.round(x / timeScale);

    if (time >= 0 && time <= waveform.maxTime) {
      setCurrentTime(time);
    }
  };

  // Loading state
  if (waveform.isLoading) {
    return (
      <div className="waveform-view waveform-view--empty">
        <Loader2 size={24} className="spinning" />
        <p>Running simulation...</p>
        <span>Capturing VCD waveform data</span>
      </div>
    );
  }

  // Error state
  if (waveform.error) {
    return (
      <div className="waveform-view waveform-view--empty waveform-view--error">
        <Radio size={24} />
        <p>Simulation Error</p>
        <span>{waveform.error}</span>
      </div>
    );
  }

  // Empty state - no signals yet
  if (waveform.signals.length === 0) {
    return (
      <div className="waveform-view waveform-view--empty">
        <Radio size={24} />
        <p>No waveform data</p>
        <span>Run an optimization with a testbench to capture waveforms</span>
        <button
          className="waveform-view__run-btn"
          onClick={() => {
            // This will be connected to the optimization store
            const { designCode, testbenchCode } = (window as unknown as { __VERIDEBUG_STORE__?: { designCode: string; testbenchCode: string } }).__VERIDEBUG_STORE__ || {};
            if (designCode && testbenchCode) {
              runSimulationWithVcd(designCode, testbenchCode);
            }
          }}
        >
          <Play size={14} />
          Run Simulation
        </button>
      </div>
    );
  }

  const totalWidth = Math.max(waveform.maxTime * timeScale, 800);

  return (
    <div className="waveform-view">
      <div className="waveform-view__header">
        <h3>Signal Waveforms</h3>
        <div className="waveform-view__status">
          <span className={`waveform-view__sim-status ${waveform.simPassed ? 'passed' : 'failed'}`}>
            {waveform.simPassed ? 'PASS' : 'FAIL'}
          </span>
          <span className="waveform-view__time">
            t = {waveform.currentTime}ns
          </span>
        </div>
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
            {Array.from({ length: Math.ceil(waveform.maxTime / 10) + 1 }).map((_, i) => (
              <div
                key={i}
                className="waveform-view__timeline-tick"
                style={{ left: i * 10 * timeScale }}
              >
                <span>{i * 10}ns</span>
              </div>
            ))}
            <motion.div
              className="waveform-view__timeline-cursor"
              animate={{ left: waveform.currentTime * timeScale }}
              transition={{ duration: 0.1 }}
            />
          </div>
        </div>

        {/* Signals */}
        <div className="waveform-view__signals">
          {waveform.signals.map((signal) => (
            <WaveformSignal
              key={signal.name}
              name={signal.name}
              width={signal.width}
              values={signal.values}
              currentTime={waveform.currentTime}
              maxTime={waveform.maxTime}
              timeScale={timeScale}
              isSelected={selectedSignalName === signal.name}
              onSelect={() =>
                setSelectedSignal(selectedSignalName === signal.name ? null : signal.name)
              }
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default WaveformView;
