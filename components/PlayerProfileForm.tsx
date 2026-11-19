"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_LIC_SUPABASE_URL || process.env.LIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_LIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.LIC_SUPABASE_PUBLISHABLE_KEY!
);

interface PlayerProfileFormProps {
  userId: string;
}

export function PlayerProfileForm({ userId }: PlayerProfileFormProps) {
  const [nickname, setNickname] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [bio, setBio] = useState("");
  const [favoriteSports, setFavoriteSports] = useState("Football, Badminton");
  const [skillLevel, setSkillLevel] = useState("Intermediate");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadProfile() {
      const { data } = await supabase
        .from("profiles")
        .select("nickname, birth_date, bio, favorite_sports, skill_level, avatar_url")
        .eq("id", userId)
        .single();

      if (data) {
        setNickname(data.nickname ?? "");
        setBirthDate(data.birth_date ?? "");
        setBio(data.bio ?? "");
        setFavoriteSports((data.favorite_sports ?? []).join(", "));
        setSkillLevel(data.skill_level ?? "Intermediate");
        setAvatarUrl(data.avatar_url ?? "");
      }
    }

    if (userId) loadProfile();
  }, [userId]);

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setMessage("");

    const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const filePath = `${userId}/${Date.now()}-${cleanName}`;

    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(filePath, file, { cacheControl: "3600", upsert: false });

    if (uploadError) {
      setUploading(false);
      setMessage(`Photo upload failed: ${uploadError.message}`);
      return;
    }

    const { data } = supabase.storage.from("avatars").getPublicUrl(filePath);
    setAvatarUrl(data.publicUrl);
    setUploading(false);
    setMessage("Photo uploaded. Click Save Profile to store it.");
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage("");

    const sportsArray = favoriteSports
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const { error } = await supabase.from("profiles").upsert({
      id: userId,
      nickname: nickname.trim() || null,
      birth_date: birthDate || null,
      bio: bio.trim() || null,
      favorite_sports: sportsArray,
      skill_level: skillLevel,
      avatar_url: avatarUrl || null,
      updated_at: new Date().toISOString(),
    });

    setSaving(false);
    if (error) {
      setMessage(`Save failed: ${error.message}`);
    } else {
      setMessage("Player profile saved! Everyone in your games can now see your info.");
    }
  }

  return (
    <form onSubmit={handleSaveProfile} className="space-y-4 max-w-md">
      <div className="flex items-center gap-4">
        <img
          src={avatarUrl || "/default-avatar.png"}
          alt={nickname || "Player avatar"}
          className="w-16 h-16 rounded-full object-cover border"
        />
        <label className="text-sm">
          <span className="block mb-1 font-medium">Profile Photo</span>
          <input
            type="file"
            accept="image/*"
            onChange={handleAvatarUpload}
            disabled={uploading}
          />
        </label>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Nickname</label>
        <input
          type="text"
          placeholder="e.g. AceDhruv"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          className="w-full border rounded px-3 py-2 text-black"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Birthdate</label>
        <input
          type="date"
          value={birthDate}
          onChange={(e) => setBirthDate(e.target.value)}
          className="w-full border rounded px-3 py-2 text-black"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Skill Level</label>
        <select
          value={skillLevel}
          onChange={(e) => setSkillLevel(e.target.value)}
          className="w-full border rounded px-3 py-2 text-black"
        >
          <option value="Beginner">Beginner</option>
          <option value="Intermediate">Intermediate</option>
          <option value="Competitive">Competitive</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Favorite Sports</label>
        <input
          type="text"
          placeholder="Football, Cricket, Badminton"
          value={favoriteSports}
          onChange={(e) => setFavoriteSports(e.target.value)}
          className="w-full border rounded px-3 py-2 text-black"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Bio</label>
        <textarea
          rows={3}
          placeholder="Playing style, preferred position, match availability..."
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          className="w-full border rounded px-3 py-2 text-black"
        />
      </div>

      <button
        type="submit"
        disabled={saving || uploading}
        className="px-4 py-2 rounded bg-emerald-600 text-white font-medium disabled:opacity-50"
      >
        {saving ? "Saving..." : "Save Profile"}
      </button>

      {message && <p className="text-sm">{message}</p>}
    </form>
  );
}