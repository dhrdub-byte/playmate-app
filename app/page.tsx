'use client';

import React, { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { supabase } from '@/lib/supabase';
import {
  MapPin,
  Users,
  Calendar,
  ShieldCheck,
  Plus,
  Trophy,
  Package,
  LogOut,
  CheckCircle2,
  Trash2,
  Navigation,
  Building2,
  XCircle,
  LocateFixed,
  KeyRound,
  RotateCcw,
  Map as MapIcon,
  Sparkles,
} from 'lucide-react';
import type { ActivePlayerPin } from './components/SnapMapView';

const SnapMapView = dynamic(() => import('./components/SnapMapView'), {
  ssr: false,
  loading: () => (
    <div className="h-[400px] w-full rounded-2xl bg-slate-900 border border-slate-800 animate-pulse flex items-center justify-center text-xs text-slate-400 mb-8">
      Loading live sports map...
    </div>
  ),
});

type Participant = {
  user_id: string;
  player_name: string;
};

type SportEvent = {
  id: string;
  host_id: string;
  host_name: string;
  sport: string;
  title: string;
  venue: string;
  distance_km: number;
  event_time: string;
  age_group: string;
  gender_pref: string;
  fee_inr: number;
  equipment_status: string;
  max_players: number;
  host_lat?: number | null;
  host_lng?: number | null;
  event_participants: Participant[];
};

type GroundListing = {
  id: string;
  owner_id: string;
  owner_name: string;
  name: string;
  sport: string;
  location_label: string;
  latitude: number | null;
  longitude: number | null;
  price_per_hour: number;
  surface_or_gear: string;
  availability_note: string;
};

type GroundBooking = {
  id: string;
  ground_id: string;
  renter_id: string;
  renter_name: string;
  slot_label: string;
  hours_count: number;
  total_inr: number;
};

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return Number((R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(1));
}

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

function checkEligibility(
  ev: SportEvent,
  user: any,
  joinedCount: number
): { eligible: boolean; reasons: string[] } {
  if (!user) {
    return { eligible: false, reasons: ['Log in to check eligibility'] };
  }

  const reasons: string[] = [];
  const userAge = Number(user.user_metadata?.age);
  const userGender = String(user.user_metadata?.gender || '').toLowerCase();
  const prefGender = String(ev.gender_pref || 'Open to all').toLowerCase();

  if (prefGender === 'men' && userGender && userGender !== 'male' && userGender !== 'men') {
    reasons.push('Men only');
  }
  if (prefGender === 'women' && userGender && userGender !== 'female' && userGender !== 'women') {
    reasons.push('Women only');
  }

  const range = parseAgeRange(ev.age_group);
  if (range && userAge && !Number.isNaN(userAge)) {
    if (userAge < range.min || userAge > range.max) {
      reasons.push(`Age ${range.min}–${range.max} only`);
    }
  }

  const alreadyJoined = ev.event_participants?.some((p) => p.user_id === user.id);
  if (!alreadyJoined && joinedCount >= ev.max_players) {
    reasons.push('Match full');
  }

  return { eligible: reasons.length === 0, reasons };
}

function initialsFromName(name: string) {
  return (name || 'P')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');
}

export default function PlaymateApp() {
  const [user, setUser] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'matches' | 'grounds' | 'map'>('matches');

  // Auth & Sign-Up OTP state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [age, setAge] = useState('19');
  const [gender, setGender] = useState('Male');
  const [isSignUp, setIsSignUp] = useState(false);
  const [awaitingOtp, setAwaitingOtp] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authInfo, setAuthInfo] = useState('');

  // Live location + Snap Map presence state
  const [liveCoords, setLiveCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [sharingLiveLocation, setSharingLiveLocation] = useState(false);
  const [watchId, setWatchId] = useState<number | null>(null);
  const [locationStatus, setLocationStatus] = useState('Live location off');
  const [presencePlayers, setPresencePlayers] = useState<ActivePlayerPin[]>([]);

  // Matches state
  const [events, setEvents] = useState<SportEvent[]>([]);
  const [selectedSport, setSelectedSport] = useState('All');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Grounds rental state
  const [grounds, setGrounds] = useState<GroundListing[]>([]);
  const [bookings, setBookings] = useState<GroundBooking[]>([]);
  const [showGroundModal, setShowGroundModal] = useState(false);
  const [groundError, setGroundError] = useState('');
  const [bookingGroundId, setBookingGroundId] = useState<string | null>(null);
  const [slotInput, setSlotInput] = useState('Today, 5:00 PM – 6:00 PM');
  const [hoursInput, setHoursInput] = useState(1);

  const [formData, setFormData] = useState({
    sport: 'Football',
    title: '',
    venue: 'Sports Complex Ground',
    distance_km: 0.8,
    event_time: 'Today, 6:00 PM',
    age_group: '18 to 25',
    gender_pref: 'Open to all',
    fee_inr: 0,
    equipment_status: 'Ball & gear available',
    max_players: 10,
    share_my_live_pin: true,
  });

  const [groundForm, setGroundForm] = useState({
    name: '',
    sport: 'Football',
    location_label: 'Sector / Campus Ground',
    price_per_hour: 500,
    surface_or_gear: 'Floodlights, goalposts & balls included',
    availability_note: 'Open for hourly & match bookings',
    use_my_live_coords: true,
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        setAwaitingOtp(false);
        setOtpCode('');
        setAuthError('');
        setAuthInfo('');
      }
    });

    fetchAllData();
    return () => {
      subscription.unsubscribe();
      if (watchId !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, []);

  useEffect(() => {
    const channel = supabase.channel('playmate-live-map', {
      config: {
        presence: { key: user?.id || `guest-${Math.random().toString(36).slice(2, 7)}` },
      },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const list: ActivePlayerPin[] = [];
        Object.entries(state).forEach(([key, presences]) => {
          const arr = presences as Array<any>;
          if (arr.length > 0) {
            const p = arr[0];
            if (typeof p.lat === 'number' && typeof p.lng === 'number') {
              list.push({
                key,
                name: p.name || 'Player',
                sport: p.sport || 'All Sports',
                lat: p.lat,
                lng: p.lng,
                isMe: Boolean(user?.id && key === user.id),
              });
            }
          }
        });
        setPresencePlayers(list);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED' && sharingLiveLocation && liveCoords) {
          await channel.track({
            name: user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Active Player',
            sport: selectedSport === 'All' ? 'Football' : selectedSport,
            lat: liveCoords.lat,
            lng: liveCoords.lng,
          });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, sharingLiveLocation, liveCoords, selectedSport]);

  async function fetchAllData() {
    setLoading(true);
    const [evRes, grRes, bkRes] = await Promise.all([
      supabase
        .from('events')
        .select(`*, event_participants(user_id, player_name)`)
        .order('created_at', { ascending: false }),
      supabase.from('grounds').select('*').order('created_at', { ascending: false }),
      supabase.from('ground_bookings').select('*').order('created_at', { ascending: false }),
    ]);

    if (!evRes.error && evRes.data) setEvents(evRes.data as SportEvent[]);
    if (!grRes.error && grRes.data) setGrounds(grRes.data as GroundListing[]);
    if (!bkRes.error && bkRes.data) setBookings(bkRes.data as GroundBooking[]);
    setLoading(false);
  }

  function toggleLiveLocation() {
    if (!navigator.geolocation) {
      setLocationStatus('Geolocation not supported in this browser');
      return;
    }

    if (sharingLiveLocation) {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      setWatchId(null);
      setSharingLiveLocation(false);
      setLocationStatus('Live location paused');
      return;
    }

    setLocationStatus('Requesting live GPS...');
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const coords = {
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
        };
        setLiveCoords(coords);
        setSharingLiveLocation(true);
        setLocationStatus(`Live: ${coords.lat}, ${coords.lng}`);
      },
      (err) => {
        setSharingLiveLocation(false);
        setLocationStatus(`Location error: ${err.message}`);
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 10000 }
    );
    setWatchId(id);
  }

  async function handleAuth(e: React.FormEvent) {
    e.preventDefault();
    setAuthError('');
    setAuthInfo('');
    setAuthLoading(true);

    const cleanEmail = email.trim();

    if (isSignUp) {
      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          data: {
            full_name: playerName.trim() || cleanEmail.split('@')[0],
            age: Number(age) || 18,
            gender,
          },
        },
      });
      setAuthLoading(false);

      if (error) {
        setAuthError(error.message);
        return;
      }

      if (data.session) {
        setAuthInfo('Account verified and logged in!');
      } else {
        setAwaitingOtp(true);
        setOtpCode('');
        setAuthInfo(`OTP sent to ${cleanEmail}. Enter the verification code below.`);
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });
      setAuthLoading(false);
      if (error) setAuthError(error.message);
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setAuthError('');
    setAuthInfo('');
    setAuthLoading(true);

    const { data, error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: otpCode.trim(),
      type: 'signup',
    });

    setAuthLoading(false);

    if (error) {
      setAuthError(error.message);
      return;
    }

    if (data.session?.user) {
      setUser(data.session.user);
      setAwaitingOtp(false);
      setOtpCode('');
    } else {
      setAuthInfo('Email verified! You can now log in with your email and password.');
      setAwaitingOtp(false);
      setIsSignUp(false);
    }
  }

  async function handleResendOtp() {
    setAuthError('');
    setAuthInfo('');
    setAuthLoading(true);

    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email.trim(),
    });

    setAuthLoading(false);
    if (error) {
      setAuthError(error.message);
    } else {
      setAuthInfo(`A fresh OTP was sent to ${email.trim()}.`);
    }
  }

  async function handleCreateEvent(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');

    const { data: sessionData } = await supabase.auth.getSession();
    const activeUser = sessionData.session?.user || user;
    if (!activeUser) {
      setFormError('Please log in first.');
      return;
    }

    setSubmitting(true);
    const hostName =
      activeUser.user_metadata?.full_name || activeUser.email?.split('@')[0] || 'Player';

    const payload: any = {
      host_id: activeUser.id,
      host_name: hostName,
      sport: formData.sport,
      title: formData.title.trim() || `${formData.sport} Match`,
      venue: formData.venue.trim(),
      distance_km: Number(formData.distance_km) || 0.5,
      event_time: formData.event_time.trim(),
      age_group: formData.age_group.trim(),
      gender_pref: formData.gender_pref,
      fee_inr: Number(formData.fee_inr) || 0,
      equipment_status: formData.equipment_status.trim(),
      max_players: Number(formData.max_players) || 10,
    };

    if (formData.share_my_live_pin && liveCoords) {
      payload.host_lat = liveCoords.lat;
      payload.host_lng = liveCoords.lng;
    }

    const { data: newEvent, error } = await supabase
      .from('events')
      .insert([payload])
      .select()
      .single();

    if (error) {
      setFormError(error.message);
      setSubmitting(false);
      return;
    }

    if (newEvent) {
      await supabase.from('event_participants').insert([
        {
          event_id: newEvent.id,
          user_id: activeUser.id,
          player_name: hostName,
        },
      ]);
      setShowCreateModal(false);
      setSubmitting(false);
      fetchAllData();
    }
  }

  async function toggleJoinEvent(ev: SportEvent, eligible: boolean) {
    if (!user) {
      alert('Please log in first to join a game.');
      return;
    }

    const isJoined = ev.event_participants?.some((p) => p.user_id === user.id);
    if (!isJoined && !eligible) return;

    setBusyId(ev.id);
    if (isJoined) {
      await supabase
        .from('event_participants')
        .delete()
        .match({ event_id: ev.id, user_id: user.id });
    } else {
      const name = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Player';
      await supabase.from('event_participants').insert([
        {
          event_id: ev.id,
          user_id: user.id,
          player_name: name,
        },
      ]);
    }
    await fetchAllData();
    setBusyId(null);
  }

  async function handleDeleteEvent(eventId: string) {
    if (!user) return;
    setBusyId(eventId);
    await supabase.from('events').delete().match({ id: eventId, host_id: user.id });
    await fetchAllData();
    setBusyId(null);
  }

  async function handleListGround(e: React.FormEvent) {
    e.preventDefault();
    setGroundError('');
    const { data: sessionData } = await supabase.auth.getSession();
    const activeUser = sessionData.session?.user || user;
    if (!activeUser) {
      setGroundError('Please log in to list a ground.');
      return;
    }

    setSubmitting(true);
    const ownerName =
      activeUser.user_metadata?.full_name || activeUser.email?.split('@')[0] || 'Owner';

    const { error } = await supabase.from('grounds').insert([
      {
        owner_id: activeUser.id,
        owner_name: ownerName,
        name: groundForm.name.trim(),
        sport: groundForm.sport,
        location_label: groundForm.location_label.trim(),
        latitude: groundForm.use_my_live_coords && liveCoords ? liveCoords.lat : null,
        longitude: groundForm.use_my_live_coords && liveCoords ? liveCoords.lng : null,
        price_per_hour: Number(groundForm.price_per_hour) || 0,
        surface_or_gear: groundForm.surface_or_gear.trim(),
        availability_note: groundForm.availability_note.trim(),
      },
    ]);

    setSubmitting(false);
    if (error) {
      setGroundError(error.message);
      return;
    }

    setGroundForm({
      name: '',
      sport: 'Football',
      location_label: 'Sector / Campus Ground',
      price_per_hour: 500,
      surface_or_gear: 'Floodlights, goalposts & balls included',
      availability_note: 'Open for hourly & match bookings',
      use_my_live_coords: true,
    });
    setShowGroundModal(false);
    fetchAllData();
  }
function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window !== 'undefined' && (window as any).Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

async function processRazorpayPayment(params: {
  amountInr: number;
  title: string;
  purpose: string;
  receipt: string;
  activeUser: any;
}): Promise<boolean> {
  const { amountInr, title, purpose, receipt, activeUser } = params;
  if (!amountInr || amountInr <= 0) return true;

  const loaded = await loadRazorpayScript();
  if (!loaded) {
    alert('Failed to load Razorpay checkout.');
    return false;
  }

  const orderRes = await fetch('/api/razorpay/order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amountInr, purpose, receipt }),
  });
  const orderData = await orderRes.json();
  if (!orderRes.ok || !orderData.orderId) {
    alert(orderData.error || 'Could not initialize payment order.');
    return false;
  }

  return new Promise((resolve) => {
    const options = {
      key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
      amount: orderData.amount,
      currency: orderData.currency || 'INR',
      name: 'Playmate',
      description: title,
      order_id: orderData.orderId,
      prefill: {
        name: activeUser?.user_metadata?.full_name || 'Player',
        email: activeUser?.email || '',
      },
      theme: { color: '#10b981' },
      handler: async (response: any) => {
        const verifyRes = await fetch('/api/razorpay/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(response),
        });
        const verifyData = await verifyRes.json();
        if (verifyRes.ok && verifyData.verified) {
          resolve(true);
        } else {
          alert(verifyData.error || 'Payment verification failed.');
          resolve(false);
        }
      },
      modal: {
        ondismiss: () => resolve(false),
      },
    };

    const rzp = new (window as any).Razorpay(options);
    rzp.open();
  });
}
  async function handleRentGround(ground: GroundListing) {
  if (!user) {
    alert('Please log in first to rent a ground.');
    return;
  }

  const hrs = Math.max(1, Number(hoursInput) || 1);
  const pricePerHour = Number(ground.price_per_hour) || 0;
  const totalInr = hrs * pricePerHour;

  setBusyId(ground.id);

  if (totalInr > 0) {
    if (!process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID) {
      alert('Missing NEXT_PUBLIC_RAZORPAY_KEY_ID in .env.local. Restart npm run dev after adding it.');
      setBusyId(null);
      return;
    }

    const paid = await processRazorpayPayment({
      amountInr: totalInr,
      title: `Ground Rental: ${ground.name} (${slotInput.trim() || 'Slot'})`,
      purpose: 'ground_rental',
      receipt: `ground_${ground.id.slice(0, 8)}`,
      activeUser: user,
    });

    if (!paid) {
      setBusyId(null);
      return;
    }
  }

  const renterName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Player';

  const { error } = await supabase.from('ground_bookings').insert([
    {
      ground_id: ground.id,
      renter_id: user.id,
      renter_name: renterName,
      slot_label: slotInput.trim() || 'Upcoming Slot',
      hours_count: hrs,
      total_inr: totalInr,
    },
  ]);

  if (error) {
    alert(`Booking failed: ${error.message}`);
    setBusyId(null);
    return;
  }

  setBookingGroundId(null);
  await fetchAllData();
  setBusyId(null);}
  const filteredEvents = useMemo(() => {
    const base =
      selectedSport === 'All'
        ? events
        : events.filter((e) => e.sport.toLowerCase() === selectedSport.toLowerCase());

    return base.map((ev) => {
      const computedKm =
        liveCoords && ev.host_lat != null && ev.host_lng != null
          ? haversineKm(liveCoords.lat, liveCoords.lng, ev.host_lat, ev.host_lng)
          : ev.distance_km;
      return { ...ev, displayDistanceKm: computedKm };
    });
  }, [events, selectedSport, liveCoords]);

  const mapEvents = useMemo(
    () =>
      filteredEvents.map((ev: any) => ({
        id: ev.id,
        title: ev.title,
        sport: ev.sport,
        venue: ev.venue,
        event_time: ev.event_time,
        max_players: ev.max_players,
        joined_count: ev.event_participants?.length || 0,
        host_lat: ev.host_lat,
        host_lng: ev.host_lng,
        distance_km: ev.displayDistanceKm,
      })),
    [filteredEvents]
  );

  const userAge = user?.user_metadata?.age;
  const userGender = user?.user_metadata?.gender;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800/90 bg-slate-900/90 backdrop-blur sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 py-3.5 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            <div className="bg-gradient-to-br from-emerald-400 to-teal-500 p-2 rounded-xl text-slate-950 shadow-md shadow-emerald-500/20">
              <Trophy className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h1 className="text-xl font-extrabold tracking-tight text-white">PLAYMATE</h1>
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <p className="text-xs text-slate-400">Snap-style live map, matches & ground rentals</p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={toggleLiveLocation}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                sharingLiveLocation
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40 shadow-sm shadow-emerald-500/10'
                  : 'bg-slate-800 text-slate-200 border-slate-700 hover:border-slate-600'
              }`}
              title={locationStatus}
            >
              <LocateFixed className="w-3.5 h-3.5" />
              {sharingLiveLocation ? 'Live Location ON' : 'Share Live Location'}
            </button>

            {user ? (
              <>
                <span className="hidden md:inline text-xs text-slate-300 bg-slate-800/90 border border-slate-700/70 px-3 py-1.5 rounded-lg">
                  {user.user_metadata?.full_name || user.email}
                  {userAge ? ` • ${userAge}y` : ''}
                  {userGender ? ` • ${userGender}` : ''}
                </span>
                {activeTab === 'grounds' ? (
                  <button
                    onClick={() => {
                      setGroundError('');
                      setShowGroundModal(true);
                    }}
                    className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold px-3.5 py-2 rounded-lg text-xs transition cursor-pointer"
                  >
                    <Plus className="w-4 h-4" /> List Ground for Rent
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setFormError('');
                      setShowCreateModal(true);
                    }}
                    className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold px-3.5 py-2 rounded-lg text-xs transition cursor-pointer"
                  >
                    <Plus className="w-4 h-4" /> Create Event
                  </button>
                )}
                <button
                  onClick={() => supabase.auth.signOut()}
                  className="p-2 text-slate-400 hover:text-white rounded-lg border border-slate-800 hover:border-slate-700 transition cursor-pointer"
                  title="Sign out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </>
            ) : (
              <span className="text-xs bg-slate-800 text-emerald-400 border border-slate-700/70 px-3 py-1.5 rounded-full font-medium">
                Sign up with Email OTP below
              </span>
            )}
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-4 pb-3 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setActiveTab('matches')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeTab === 'matches'
                  ? 'bg-emerald-500 text-slate-950'
                  : 'bg-slate-800/80 text-slate-300 hover:text-white'
              }`}
            >
              Nearby Matches
            </button>
            <button
              onClick={() => setActiveTab('map')}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeTab === 'map'
                  ? 'bg-emerald-500 text-slate-950'
                  : 'bg-slate-800/80 text-slate-300 hover:text-white'
              }`}
            >
              <MapIcon className="w-3.5 h-3.5" /> Live Map ({presencePlayers.length} active)
            </button>
            <button
              onClick={() => setActiveTab('grounds')}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeTab === 'grounds'
                  ? 'bg-emerald-500 text-slate-950'
                  : 'bg-slate-800/80 text-slate-300 hover:text-white'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" /> Rent / Book Grounds
            </button>
          </div>
          <span className="text-[11px] text-slate-400">{locationStatus}</span>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {!user && (
          <div className="mb-8 bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md mx-auto shadow-lg shadow-black/20">
            {awaitingOtp ? (
              <div>
                <div className="flex items-center gap-2 text-emerald-400 mb-1">
                  <KeyRound className="w-4 h-4" />
                  <h2 className="text-lg font-bold text-white">Verify Email with OTP</h2>
                </div>
                <p className="text-xs text-slate-400 mb-4">
                  Enter the OTP code sent to <span className="text-slate-200 font-medium">{email}</span>.
                </p>

                <form onSubmit={handleVerifyOtp} className="space-y-3">
                  <input
                    type="text"
                    placeholder="Enter OTP code"
                    required
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-lg text-sm tracking-widest focus:outline-none focus:border-emerald-500"
                  />

                  {authError && <p className="text-xs text-rose-400">{authError}</p>}
                  {authInfo && <p className="text-xs text-emerald-400">{authInfo}</p>}

                  <button
                    type="submit"
                    disabled={authLoading}
                    className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold py-2.5 rounded-lg text-sm transition cursor-pointer disabled:opacity-50"
                  >
                    {authLoading ? 'Verifying...' : 'Verify OTP & Continue'}
                  </button>
                </form>

                <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
                  <button
                    type="button"
                    onClick={handleResendOtp}
                    disabled={authLoading}
                    className="flex items-center gap-1 hover:text-emerald-400 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> Resend OTP
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAwaitingOtp(false);
                      setOtpCode('');
                      setAuthError('');
                      setAuthInfo('');
                    }}
                    className="hover:text-white cursor-pointer"
                  >
                    Change email
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <h2 className="text-lg font-bold mb-1">
                  {isSignUp ? 'Create your Playmate profile' : 'Log in to Playmate'}
                </h2>
                <p className="text-xs text-slate-400 mb-4">
                  {isSignUp
                    ? 'Includes email OTP verification plus age & gender eligibility checks.'
                    : 'Sign in to host games, check eligibility, and rent grounds.'}
                </p>
                <form onSubmit={handleAuth} className="space-y-3">
                  {isSignUp && (
                    <>
                      <input
                        type="text"
                        placeholder="Your Name"
                        required
                        value={playerName}
                        onChange={(e) => setPlayerName(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-lg text-sm focus:outline-none focus:border-emerald-500"
                      />
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] text-slate-400 mb-1">Age</label>
                          <input
                            type="number"
                            min="10"
                            max="99"
                            required
                            value={age}
                            onChange={(e) => setAge(e.target.value)}
                            className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-slate-400 mb-1">Gender</label>
                          <select
                            value={gender}
                            onChange={(e) => setGender(e.target.value)}
                            className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm"
                          >
                            <option>Male</option>
                            <option>Female</option>
                            <option>Other</option>
                          </select>
                        </div>
                      </div>
                    </>
                  )}
                  <input
                    type="email"
                    placeholder="Email address"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-lg text-sm focus:outline-none focus:border-emerald-500"
                  />
                  <input
                    type="password"
                    placeholder="Password (min 6 characters)"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-lg text-sm focus:outline-none focus:border-emerald-500"
                  />
                  {authError && <p className="text-xs text-rose-400">{authError}</p>}
                  {authInfo && <p className="text-xs text-emerald-400">{authInfo}</p>}
                  <button
                    type="submit"
                    disabled={authLoading}
                    className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold py-2.5 rounded-lg text-sm transition cursor-pointer disabled:opacity-50"
                  >
                    {authLoading
                      ? 'Please wait...'
                      : isSignUp
                      ? 'Send OTP & Sign Up'
                      : 'Log In'}
                  </button>
                </form>
                <button
                  type="button"
                  onClick={() => {
                    setAuthError('');
                    setAuthInfo('');
                    setIsSignUp(!isSignUp);
                  }}
                  className="mt-3 text-xs text-slate-400 hover:text-emerald-400 w-full text-center cursor-pointer"
                >
                  {isSignUp ? 'Already have an account? Log in' : 'New here? Sign up with Email OTP'}
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'map' && (
          <div>
            <div className="mb-4">
              <h2 className="text-lg font-bold">Live Snap-Style Sports Map</h2>
              <p className="text-xs text-slate-400">
                Shows active players broadcasting their live location, ongoing match events, and rental grounds. Click any pin for details.
              </p>
            </div>
            <SnapMapView
              userCoords={liveCoords}
              activePlayers={presencePlayers}
              events={mapEvents}
              grounds={grounds}
              onEnableLocation={toggleLiveLocation}
            />
          </div>
        )}

        {activeTab === 'matches' && (
          <>
            <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                Nearby Now
              </h2>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {['All', 'Football', 'Cricket', 'Badminton', 'Volleyball', 'Basketball'].map(
                  (sport) => (
                    <button
                      key={sport}
                      onClick={() => setSelectedSport(sport)}
                      className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition cursor-pointer ${
                        selectedSport === sport
                          ? 'bg-emerald-500 text-slate-950 shadow-sm shadow-emerald-500/20'
                          : 'bg-slate-900 text-slate-300 border border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      {sport}
                    </button>
                  )
                )}
              </div>
            </div>

            {loading ? (
              <div className="grid md:grid-cols-2 gap-5">
                {[1, 2, 3, 4].map((n) => (
                  <div
                    key={n}
                    className="h-56 bg-slate-900/80 border border-slate-800 rounded-2xl p-5 animate-pulse space-y-4"
                  >
                    <div className="h-5 w-28 bg-slate-800 rounded" />
                    <div className="h-6 w-2/3 bg-slate-800 rounded" />
                    <div className="h-4 w-1/2 bg-slate-800 rounded" />
                    <div className="h-10 w-full bg-slate-800/70 rounded-xl mt-6" />
                  </div>
                ))}
              </div>
            ) : filteredEvents.length === 0 ? (
              <div className="text-center py-16 bg-slate-900/50 border border-dashed border-slate-800 rounded-2xl">
                <p className="text-slate-400 mb-3">No active games found for this filter.</p>
                {user && (
                  <button
                    onClick={() => {
                      setFormError('');
                      setShowCreateModal(true);
                    }}
                    className="bg-emerald-500 text-slate-950 font-semibold px-4 py-2 rounded-lg text-sm cursor-pointer"
                  >
                    Host the first game
                  </button>
                )}
              </div>
            ) : (
              <div className="grid md:grid-cols-2 gap-5">
                {filteredEvents.map((ev: any) => {
                  const joinedList: Participant[] = ev.event_participants || [];
                  const joinedCount = joinedList.length;
                  const isJoined = Boolean(user && joinedList.some((p) => p.user_id === user.id));
                  const isHost = Boolean(user && ev.host_id === user.id);
                  const isBusy = busyId === ev.id;
                  const { eligible, reasons } = checkEligibility(ev, user, joinedCount);

                  return (
                    <div
                      key={ev.id}
                      className="bg-slate-900 border border-slate-800 hover:border-slate-700 hover:-translate-y-0.5 rounded-2xl p-5 flex flex-col justify-between transition duration-200 shadow-lg shadow-black/20"
                    >
                      <div>
                        <div className="flex justify-between items-start gap-2 mb-3">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-md">
                                {ev.sport}
                              </span>
                              {eligible ? (
                                <span className="inline-flex items-center gap-1 text-xs font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 px-2.5 py-0.5 rounded-full">
                                  <CheckCircle2 className="w-3.5 h-3.5" /> Eligible
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-xs font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/30 px-2.5 py-0.5 rounded-full">
                                  <XCircle className="w-3.5 h-3.5" /> Not Eligible: {reasons.join(' • ')}
                                </span>
                              )}
                            </div>
                            <h3 className="text-lg font-bold text-white mt-2">{ev.title}</h3>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold bg-slate-800 text-slate-300 px-2.5 py-1 rounded-full whitespace-nowrap flex items-center gap-1">
                              <Navigation className="w-3 h-3 text-emerald-400" />
                              {ev.displayDistanceKm} km
                              {ev.host_lat != null ? ' (Live)' : ''}
                            </span>
                            {isHost && (
                              <button
                                onClick={() => handleDeleteEvent(ev.id)}
                                disabled={isBusy}
                                className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-slate-800 cursor-pointer"
                                title="Delete event"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="space-y-2 text-sm text-slate-300 mb-4">
                          <div className="flex items-center gap-2">
                            <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
                            <span>{ev.venue}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
                            <span>{ev.event_time}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Package className="w-4 h-4 text-emerald-400 shrink-0" />
                            <span className="text-emerald-300">{ev.equipment_status}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-slate-400 pt-1">
                            <ShieldCheck className="w-4 h-4 text-slate-400 shrink-0" />
                            <span>
                              Age {ev.age_group} • {ev.gender_pref} • Host: {ev.host_name}
                            </span>
                          </div>
                        </div>

                        {joinedList.length > 0 && (
                          <div className="flex items-center gap-1.5 flex-wrap mb-4">
                            {joinedList.slice(0, 5).map((p) => (
                              <span
                                key={p.user_id}
                                title={p.player_name}
                                className="inline-flex items-center gap-1 text-[11px] font-semibold bg-slate-800/90 text-slate-200 border border-slate-700/70 px-2 py-0.5 rounded-full"
                              >
                                <span className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-300 flex items-center justify-center text-[9px] font-bold">
                                  {initialsFromName(p.player_name)}
                                </span>
                                {p.player_name}
                              </span>
                            ))}
                            {joinedList.length > 5 && (
                              <span className="text-[11px] text-slate-400">
                                +{joinedList.length - 5} more
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-1.5 text-sm font-bold text-white">
                            <Users className="w-4 h-4 text-emerald-400" />
                            <span>
                              {joinedCount} of {ev.max_players} joined
                            </span>
                          </div>
                          <p className="text-xs text-slate-400">
                            {ev.fee_inr === 0 ? 'Free to join' : `₹${ev.fee_inr} fee / token`}
                          </p>
                        </div>

                        <button
                          onClick={() => toggleJoinEvent(ev, eligible)}
                          disabled={isBusy || (!isJoined && !eligible)}
                          className={`px-5 py-2.5 rounded-xl font-bold text-sm transition flex items-center gap-1.5 cursor-pointer ${
                            isJoined
                              ? 'bg-slate-800 text-emerald-400 border border-emerald-500/40 hover:bg-rose-950 hover:text-rose-300'
                              : !eligible
                              ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                              : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                          }`}
                        >
                          {isJoined ? (
                            <>
                              <CheckCircle2 className="w-4 h-4" /> Joined
                            </>
                          ) : !eligible ? (
                            'Ineligible'
                          ) : (
                            'Join'
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {activeTab === 'grounds' && (
          <div>
            <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
              <div>
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-emerald-400" />
                  Rent Grounds & Play
                </h2>
                <p className="text-xs text-slate-400">
                  List your ground for rent or book an available ground for your session.
                </p>
              </div>
              {user && (
                <button
                  onClick={() => {
                    setGroundError('');
                    setShowGroundModal(true);
                  }}
                  className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-4 py-2 rounded-lg text-xs cursor-pointer"
                >
                  + List Ground for Rent
                </button>
              )}
            </div>

            {grounds.length === 0 ? (
              <div className="text-center py-16 bg-slate-900/50 border border-dashed border-slate-800 rounded-2xl">
                <p className="text-slate-400 mb-3">No grounds listed yet.</p>
                {user && (
                  <button
                    onClick={() => setShowGroundModal(true)}
                    className="bg-emerald-500 text-slate-950 font-semibold px-4 py-2 rounded-lg text-sm cursor-pointer"
                  >
                    List the first ground
                  </button>
                )}
              </div>
            ) : (
              <div className="grid md:grid-cols-2 gap-5">
                {grounds.map((gr) => {
                  const grBookings = bookings.filter((b) => b.ground_id === gr.id);
                  const distKm =
                    liveCoords && gr.latitude != null && gr.longitude != null
                      ? haversineKm(liveCoords.lat, liveCoords.lng, gr.latitude, gr.longitude)
                      : null;

                  return (
                    <div
                      key={gr.id}
                      className="bg-slate-900 border border-slate-800 hover:border-slate-700 hover:-translate-y-0.5 rounded-2xl p-5 flex flex-col justify-between gap-4 transition duration-200 shadow-lg shadow-black/20"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="text-xs font-bold uppercase text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-md">
                              {gr.sport}
                            </span>
                            <h3 className="text-lg font-bold text-white mt-2">{gr.name}</h3>
                          </div>
                          <div className="text-right">
                            <p className="text-base font-extrabold text-emerald-400">
                              ₹{gr.price_per_hour}/hr
                            </p>
                            {distKm !== null && (
                              <p className="text-[11px] text-slate-400">{distKm} km away</p>
                            )}
                          </div>
                        </div>

                        <div className="space-y-1.5 text-sm text-slate-300 mt-3">
                          <div className="flex items-center gap-2">
                            <MapPin className="w-4 h-4 text-slate-400" />
                            <span>{gr.location_label}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Package className="w-4 h-4 text-emerald-400" />
                            <span>{gr.surface_or_gear}</span>
                          </div>
                          <p className="text-xs text-slate-400">
                            Host/Owner: {gr.owner_name} • {gr.availability_note}
                          </p>
                        </div>

                        {grBookings.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-slate-800/80 text-xs text-slate-300 space-y-1">
                            <p className="font-semibold text-slate-400">Booked Slots:</p>
                            {grBookings.map((bk) => (
                              <p key={bk.id}>
                                • {bk.renter_name} — {bk.slot_label} ({bk.hours_count}h, ₹{bk.total_inr})
                              </p>
                            ))}
                          </div>
                        )}
                      </div>

                      {bookingGroundId === gr.id ? (
                        <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-2 text-xs">
                          <input
                            type="text"
                            value={slotInput}
                            onChange={(e) => setSlotInput(e.target.value)}
                            placeholder="Slot (e.g., Today, 6:00 PM – 7:00 PM)"
                            className="w-full px-2.5 py-2 bg-slate-900 border border-slate-800 rounded-lg"
                          />
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min="1"
                              max="12"
                              value={hoursInput}
                              onChange={(e) => setHoursInput(Number(e.target.value))}
                              className="w-24 px-2.5 py-2 bg-slate-900 border border-slate-800 rounded-lg"
                            />
                            <span className="text-slate-400">
                              hrs = ₹{Math.max(1, hoursInput) * gr.price_per_hour}
                            </span>
                          </div>
                          <div className="flex gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => setBookingGroundId(null)}
                              className="w-1/2 py-2 rounded-lg border border-slate-700 text-slate-300 cursor-pointer"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              disabled={busyId === gr.id}
                             onClick={() => handleRentGround(gr)}
          className="w-1/2 py-2 rounded-lg bg-emerald-500 text-slate-950 font-bold cursor-pointer"
        >
          Confirm Rental
        </button>
      </div>
    </div>
                      ) : (
                        <button
                          onClick={() => setBookingGroundId(gr.id)}
                          className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm transition cursor-pointer"
                        >
                          Take Ground on Rent
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Create Match Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold mb-4">Create Event</h3>
            <form onSubmit={handleCreateEvent} className="space-y-3 text-sm">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Sport</label>
                <select
                  value={formData.sport}
                  onChange={(e) => setFormData({ ...formData, sport: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg"
                >
                  <option>Football</option>
                  <option>Cricket</option>
                  <option>Badminton</option>
                  <option>Volleyball</option>
                  <option>Basketball</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Match Title</label>
                <input
                  type="text"
                  placeholder="e.g., Evening Match"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Venue</label>
                  <input
                    type="text"
                    required
                    value={formData.venue}
                    onChange={(e) => setFormData({ ...formData, venue: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Time</label>
                  <input
                    type="text"
                    required
                    value={formData.event_time}
                    onChange={(e) => setFormData({ ...formData, event_time: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Equipment Status</label>
                <input
                  type="text"
                  required
                  value={formData.equipment_status}
                  onChange={(e) => setFormData({ ...formData, equipment_status: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Age Group</label>
                  <input
                    type="text"
                    value={formData.age_group}
                    onChange={(e) => setFormData({ ...formData, age_group: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Gender</label>
                  <select
                    value={formData.gender_pref}
                    onChange={(e) => setFormData({ ...formData, gender_pref: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg"
                  >
                    <option>Open to all</option>
                    <option>Men</option>
                    <option>Women</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Distance (km)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    value={formData.distance_km}
                    onChange={(e) =>
                      setFormData({ ...formData, distance_km: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Max Players</label>
                  <input
                    type="number"
                    min="2"
                    max="30"
                    value={formData.max_players}
                    onChange={(e) =>
                      setFormData({ ...formData, max_players: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Fee (₹)</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.fee_inr}
                    onChange={(e) => setFormData({ ...formData, fee_inr: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-300 pt-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.share_my_live_pin}
                  onChange={(e) =>
                    setFormData({ ...formData, share_my_live_pin: e.target.checked })
                  }
                />
                Attach my live GPS pin to this event ({liveCoords ? 'GPS ready' : 'enable Live Location above'})
              </label>
              {formError && <p className="text-xs text-rose-400">{formError}</p>}
              <div className="flex gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="w-1/2 py-2.5 rounded-lg border border-slate-700 text-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-1/2 py-2.5 rounded-lg bg-emerald-500 text-slate-950 font-bold cursor-pointer disabled:opacity-50"
                >
                  {submitting ? 'Publishing...' : 'Publish'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* List Ground for Rent Modal */}
      {showGroundModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold mb-4">List Ground for Rent</h3>
            <form onSubmit={handleListGround} className="space-y-3 text-sm">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Ground Name</label>
                <input
                  type="text"
                  placeholder="e.g., Green Arena 7v7 Turf"
                  required
                  value={groundForm.name}
                  onChange={(e) => setGroundForm({ ...groundForm, name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Sport</label>
                  <select
                    value={groundForm.sport}
                    onChange={(e) => setGroundForm({ ...groundForm, sport: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg"
                  >
                    <option>Football</option>
                    <option>Cricket</option>
                    <option>Badminton</option>
                    <option>Volleyball</option>
                    <option>Basketball</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Rent per Hour (₹)</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={groundForm.price_per_hour}
                    onChange={(e) =>
                      setGroundForm({ ...groundForm, price_per_hour: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Location / Area</label>
                <input
                  type="text"
                  required
                  value={groundForm.location_label}
                  onChange={(e) =>
                    setGroundForm({ ...groundForm, location_label: e.target.value })
                  }
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Surface & Included Gear</label>
                <input
                  type="text"
                  required
                  value={groundForm.surface_or_gear}
                  onChange={(e) =>
                    setGroundForm({ ...groundForm, surface_or_gear: e.target.value })
                  }
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Availability Note</label>
                <input
                  type="text"
                  value={groundForm.availability_note}
                  onChange={(e) =>
                    setGroundForm({ ...groundForm, availability_note: e.target.value })
                  }
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg"
                />
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={groundForm.use_my_live_coords}
                  onChange={(e) =>
                    setGroundForm({ ...groundForm, use_my_live_coords: e.target.checked })
                  }
                />
                Save my live GPS coordinates for distance calculation
              </label>
              {groundError && <p className="text-xs text-rose-400">{groundError}</p>}
              <div className="flex gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowGroundModal(false)}
                  className="w-1/2 py-2.5 rounded-lg border border-slate-700 text-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-1/2 py-2.5 rounded-lg bg-emerald-500 text-slate-950 font-bold cursor-pointer disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : 'Publish Ground'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}