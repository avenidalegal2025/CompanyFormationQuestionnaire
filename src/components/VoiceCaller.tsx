"use client";

import { useState, useEffect, useRef } from 'react';
import { Device, Call } from '@twilio/voice-sdk';
import { PhoneIcon, PhoneXMarkIcon } from '@heroicons/react/24/solid';

interface VoiceCallerProps {
  onClose?: () => void;
}

export default function VoiceCaller({ onClose }: VoiceCallerProps) {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [status, setStatus] = useState<'idle' | 'connecting' | 'ringing' | 'in-call' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [device, setDevice] = useState<Device | null>(null);
  const [currentCall, setCurrentCall] = useState<Call | null>(null);
  const [callDuration, setCallDuration] = useState(0);
  const [businessNumber, setBusinessNumber] = useState('');
  
  const callTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize Twilio Device
  useEffect(() => {
    let mounted = true;

    async function setupDevice() {
      try {
        const response = await fetch('/api/phone/token');
        if (!response.ok) {
          throw new Error('Failed to get access token');
        }

        const data = await response.json();
        setBusinessNumber(data.phoneNumber);

        const newDevice = new Device(data.token, {
          logLevel: 1,
          codecPreferences: [Call.Codec.Opus, Call.Codec.PCMU],
        });

        newDevice.on('registered', () => {
          console.log('Twilio Device ready');
        });

        newDevice.on('error', (error) => {
          console.error('Device error:', error);
          setStatus('error');
          setErrorMessage('Error de conexión. Por favor recarga la página.');
        });

        await newDevice.register();

        if (mounted) {
          setDevice(newDevice);
        }
      } catch (err) {
        console.error('Setup error:', err);
        if (mounted) {
          setStatus('error');
          setErrorMessage('No se pudo inicializar el sistema de llamadas.');
        }
      }
    }

    setupDevice();

    return () => {
      mounted = false;
      if (device) {
        device.destroy();
      }
    };
  }, []);

  // Call timer
  useEffect(() => {
    if (status === 'in-call') {
      callTimerRef.current = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    } else {
      if (callTimerRef.current) {
        clearInterval(callTimerRef.current);
        callTimerRef.current = null;
      }
      setCallDuration(0);
    }

    return () => {
      if (callTimerRef.current) {
        clearInterval(callTimerRef.current);
      }
    };
  }, [status]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleCall = async () => {
    if (!device || !phoneNumber) return;

    try {
      setStatus('connecting');
      setErrorMessage('');

      console.log('Attempting to call:', phoneNumber);

      const call = await device.connect({
        params: {
          To: phoneNumber,
        },
      });

      setCurrentCall(call);

      call.on('accept', () => {
        console.log('Call accepted');
        setStatus('in-call');
      });

      call.on('ringing', () => {
        console.log('Call ringing');
        setStatus('ringing');
      });

      call.on('disconnect', () => {
        console.log('Call disconnected');
        setStatus('idle');
        setCurrentCall(null);
      });

      call.on('cancel', () => {
        console.log('Call cancelled');
        setStatus('idle');
        setCurrentCall(null);
      });

      call.on('reject', () => {
        console.log('Call rejected');
        setStatus('error');
        setErrorMessage('Llamada rechazada');
        setCurrentCall(null);
      });

      call.on('error', (error: any) => {
        console.error('Call error event:', error);
        setStatus('error');
        setErrorMessage(`Error: ${error.message || 'Desconocido'}`);
        setCurrentCall(null);
      });

    } catch (err) {
      console.error('Call error:', err);
      setStatus('error');
      setErrorMessage('No se pudo realizar la llamada. Verifica el número.');
    }
  };

  const handleHangup = () => {
    if (currentCall) {
      currentCall.disconnect();
    }
    setStatus('idle');
    setCurrentCall(null);
  };

  const handleDigitClick = (digit: string) => {
    setPhoneNumber((prev) => prev + digit);
  };

  const handleBackspace = () => {
    setPhoneNumber((prev) => prev.slice(0, -1));
  };

  const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 max-w-md mx-auto">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Realizar Llamada</h3>
        {onClose && (
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            ✕
          </button>
        )}
      </div>

      {businessNumber && (
        <div className="mb-4 text-sm text-gray-600">
          Llamando desde: <span className="font-mono font-semibold">{businessNumber}</span>
        </div>
      )}

      {/* Phone Number Display */}
      <div className="mb-6">
        <input
          type="tel"
          value={phoneNumber}
          onChange={(e) => setPhoneNumber(e.target.value)}
          placeholder="+1 555 123 4567"
          className="input text-center text-2xl font-mono"
          disabled={status !== 'idle'}
        />
      </div>

      {/* Status Display */}
      {status !== 'idle' && (
        <div className="mb-4 text-center">
          {status === 'connecting' && (
            <p className="text-blue-600">Conectando...</p>
          )}
          {status === 'ringing' && (
            <p className="text-blue-600">Llamando...</p>
          )}
          {status === 'in-call' && (
            <p className="text-green-600 text-xl font-semibold">
              {formatDuration(callDuration)}
            </p>
          )}
          {status === 'error' && (
            <p className="text-red-600">{errorMessage}</p>
          )}
        </div>
      )}

      {/* Dial Pad */}
      {status === 'idle' && (
        <>
          <div className="grid grid-cols-3 gap-3 mb-4">
            {digits.map((digit) => (
              <button
                key={digit}
                onClick={() => handleDigitClick(digit)}
                className="aspect-square rounded-full bg-gray-100 hover:bg-gray-200 text-2xl font-semibold text-gray-900 transition-colors"
              >
                {digit}
              </button>
            ))}
          </div>

          <div className="flex gap-2 mb-4">
            <button
              onClick={handleBackspace}
              className="btn flex-1 bg-gray-100 hover:bg-gray-200 text-gray-900"
            >
              ← Borrar
            </button>
            <button
              onClick={() => setPhoneNumber('')}
              className="btn flex-1 bg-gray-100 hover:bg-gray-200 text-gray-900"
            >
              Limpiar
            </button>
          </div>
        </>
      )}

      {/* Call/Hangup Buttons */}
      <div className="flex gap-3">
        {status === 'idle' ? (
          <button
            onClick={handleCall}
            disabled={!phoneNumber || !device}
            className="btn btn-primary flex-1 flex items-center justify-center gap-2 py-4 text-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <PhoneIcon className="h-6 w-6" />
            Llamar
          </button>
        ) : (
          <button
            onClick={handleHangup}
            className="btn flex-1 flex items-center justify-center gap-2 py-4 text-lg bg-red-600 hover:bg-red-700 text-white"
          >
            <PhoneXMarkIcon className="h-6 w-6" />
            Colgar
          </button>
        )}
      </div>

      <p className="text-xs text-gray-500 mt-4 text-center">
        Las llamadas se realizarán desde tu número empresarial de EE. UU.
      </p>
    </div>
  );
}

