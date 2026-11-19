'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Camera, ShieldCheck, UserCheck, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type JoinVerificationModalProps = {
  isOpen: boolean;
  onClose: () => void;
  user: any;
  eventTitle: string;
  ageGroup: string;
  onVerified: (updatedUser: any) => void;
};

function parseAgeRange(ageGroupText: string): { min: number; max: number } | null {
  if (!ageGroupText) return null;
  const lower = ageGroupText.toLowerCase();
  if (lower.includes('all') || lower.includes('any')) return null;
  const matches = ageGroupText.match(/\d+/g);
  if (!matches || matches.length === 0) return null;
  if (matches.length === 1) {
    const val = Number(matches[0]);
    return { min: val, max: 120 };
  }
  return { min: Number(matches[0]), max: Number(matches[1]) };
}

export default function JoinVerificationModal({
  isOpen,
  onClose,
  user,
  eventTitle,
  ageGroup,
  onVerified,
}: JoinVerificationModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const alreadyFaceVerified = Boolean(user?.user_metadata?.face_verified);

  const [ageInput, setAgeInput] = useState<string>(String(user?.user_metadata?.age || ''));
  const [cameraActive, setCameraActive] = useState(false);
  const [faceCaptured, setFaceCaptured] = useState(alreadyFaceVerified);
  const [errorMsg, setErrorMsg] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setAgeInput(String(user?.user_metadata?.age || ''));
    setFaceCaptured(Boolean(user?.user_metadata?.face_verified));
    setErrorMsg('');
  }, [user, isOpen]);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }

  async function startCamera() {
    setErrorMsg('');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setErrorMsg('Camera access is not supported in this browser.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: false,
      });
      streamRef.current = stream;
      setCameraActive(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to open camera. Please allow camera permission.');
    }
  }

  function handleCaptureFace() {
    if (!videoRef.current || videoRef.current.readyState < 2) {
      setErrorMsg('Camera is still warming up—try capturing again in a second.');
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth || 320;
    canvas.height = videoRef.current.videoHeight || 240;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    }
    stopCamera();
    setFaceCaptured(true);
    setErrorMsg('');
  }

  async function handleConfirmVerification(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg('');

    const parsedAge = Number(ageInput);
    if (!parsedAge || Number.isNaN(parsedAge) || parsedAge < 8 || parsedAge > 100) {
      setErrorMsg('Please enter a valid age.');
      return;
    }

    const range = parseAgeRange(ageGroup);
    if (range && (parsedAge < range.min || parsedAge > range.max)) {
      setErrorMsg(`This game requires age ${range.min} to ${range.max}. Your age (${parsedAge}) does not match.`);
      return;
    }

    if (!faceCaptured) {
      setErrorMsg('Please complete face verification before joining this game.');
      return;
    }

    setSaving(true);
    const { data, error } = await supabase.auth.updateUser({
      data: {
        age: parsedAge,
        face_verified: true,
        face_verified_at: new Date().toISOString(),
      },
    });
    setSaving(false);

    if (error) {
      setErrorMsg(error.message);
      return;
    }

    stopCamera();
    onVerified(
      data.user || {
        ...user,
        user_metadata: { ...user?.user_metadata, age: parsedAge, face_verified: true },
      }
    );
    onClose();
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              Game Join Verification
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Required to join <span className="text-slate-200 font-semibold">{eventTitle}</span> (Age rule: {ageGroup}).
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="p-1 text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleConfirmVerification} className="space-y-4 text-sm">
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-2">
            <label className="block text-xs font-semibold text-slate-300">
              1. Confirm Your Age
            </label>
            <input
              type="number"
              min="8"
              max="100"
              required
              value={ageInput}
              onChange={(e) => setAgeInput(e.target.value)}
              placeholder="Enter your age"
              className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm"
            />
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300">2. Face Verification</span>
              {faceCaptured && (
                <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1">
                  <UserCheck className="w-3.5 h-3.5" /> Verified
                </span>
              )}
            </div>

            {faceCaptured ? (
              <div className="flex items-center justify-between text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-2.5">
                <span>Face check completed for your profile.</span>
                <button
                  type="button"
                  onClick={() => {
                    setFaceCaptured(false);
                    startCamera();
                  }}
                  className="underline text-emerald-200 cursor-pointer"
                >
                  Retake
                </button>
              </div>
            ) : cameraActive ? (
              <div className="space-y-2">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-44 object-cover rounded-lg bg-black border border-slate-800"
                />
                <button
                  type="button"
                  onClick={handleCaptureFace}
                  className="w-full py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs cursor-pointer"
                >
                  Capture & Verify Face
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={startCamera}
                className="w-full py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 font-semibold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Camera className="w-4 h-4 text-emerald-400" />
                Open Camera for Face Verification
              </button>
            )}
          </div>

          {errorMsg && <p className="text-xs text-rose-400">{errorMsg}</p>}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                stopCamera();
                onClose();
              }}
              className="w-1/2 py-2.5 rounded-lg border border-slate-700 text-slate-300 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="w-1/2 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold cursor-pointer disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Continue'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}