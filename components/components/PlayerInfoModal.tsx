"use client";

export interface PlayerProfile {
  id: string;
  nickname: string | null;
  full_name: string | null;
  avatar_url: string | null;
  birth_date: string | null;
  bio: string | null;
  favorite_sports: string[] | null;
  skill_level: string | null;
}

function getAge(birthDate: string | null): number | null {
  if (!birthDate) return null;
  const dob = new Date(birthDate);
  if (Number.isNaN(dob.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age--;
  }
  return age;
}

export function PlayerInfoModal({
  player,
  onClose,
}: {
  player: PlayerProfile | null;
  onClose: () => void;
}) {
  if (!player) return null;

  const age = getAge(player.birth_date);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-sm rounded-xl border border-neutral-800 bg-neutral-900 p-5 text-white space-y-4">
        <div className="flex items-center gap-3">
          <img
            src={player.avatar_url || "/default-avatar.png"}
            alt={player.nickname || player.full_name || "Player"}
            className="w-14 h-14 rounded-full object-cover border border-neutral-700"
          />
          <div>
            <h3 className="text-lg font-semibold">
              {player.nickname || player.full_name || "Player"}
            </h3>
            <p className="text-xs text-neutral-400">
              {player.skill_level || "Player"}
              {age !== null ? ` • ${age} yrs` : ""}
            </p>
          </div>
        </div>

        {player.favorite_sports && player.favorite_sports.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {player.favorite_sports.map((sport) => (
              <span
                key={sport}
                className="rounded-full bg-emerald-950 border border-emerald-700/50 px-2.5 py-0.5 text-xs text-emerald-300"
              >
                {sport}
              </span>
            ))}
          </div>
        )}

        <p className="text-sm text-neutral-300 leading-relaxed">
          {player.bio || "No bio added yet."}
        </p>

        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-lg bg-neutral-800 py-2 text-sm font-medium hover:bg-neutral-700"
        >
          Close
        </button>
      </div>
    </div>
  );
}