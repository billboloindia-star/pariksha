import { useRef, useState } from "react";
import * as api from "../../shared/api";
import Spinner from "./Spinner";
import { initials, LogoutIcon } from "./Sidebar";

interface Props {
  session: api.Session;
  onSessionChange: (session: api.Session) => void;
  onLogout: () => void;
}

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const ALLOWED_AVATAR_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function passwordStrength(pw: string): { score: 0 | 1 | 2 | 3; label: string } {
  if (!pw) return { score: 0, label: "" };
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12 || /[0-9]/.test(pw)) score++;
  if (/[^a-zA-Z0-9]/.test(pw) || (/[A-Z]/.test(pw) && /[a-z]/.test(pw))) score++;
  const labels = ["Too short", "Weak", "Good — add a symbol to make it strong", "Strong"];
  return { score: Math.min(3, score) as 0 | 1 | 2 | 3, label: labels[Math.min(3, score)] };
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function Profile({ session, onSessionChange, onLogout }: Props) {
  const [name, setName] = useState(session.name ?? "");
  const [savingName, setSavingName] = useState(false);
  const [nameStatus, setNameStatus] = useState<"idle" | "saved" | "error">("idle");

  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwStatus, setPwStatus] = useState<"idle" | "saved" | "error">("idle");
  const [pwError, setPwError] = useState("");

  const strength = passwordStrength(newPassword);
  const displayName = session.name || session.email.split("@")[0];

  async function saveName() {
    const trimmed = name.trim();
    setSavingName(true);
    setNameStatus("idle");
    try {
      const updated = await api.updateProfile(trimmed);
      onSessionChange({ ...session, name: updated.name ?? null });
      setNameStatus("saved");
      setTimeout(() => setNameStatus("idle"), 2000);
    } catch {
      setNameStatus("error");
    } finally {
      setSavingName(false);
    }
  }

  async function onPickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setAvatarError("");
    if (!ALLOWED_AVATAR_TYPES.has(file.type)) {
      setAvatarError("Use a JPEG, PNG, or WEBP image.");
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setAvatarError("Image is too large (max 2MB).");
      return;
    }
    setAvatarUploading(true);
    try {
      const base64 = await fileToBase64(file);
      const updated = await api.uploadAvatar(base64, file.type);
      onSessionChange({ ...session, avatarUrl: updated.avatarUrl ?? null });
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : "Couldn't upload that image.");
    } finally {
      setAvatarUploading(false);
    }
  }

  async function savePassword() {
    setPwError("");
    setPwStatus("idle");
    if (newPassword.length < 8) {
      setPwError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError("Passwords don't match.");
      return;
    }
    setPwSaving(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPwStatus("saved");
      setTimeout(() => setPwStatus("idle"), 2500);
    } catch (err) {
      setPwError(err instanceof Error ? err.message : "Couldn't update your password.");
      setPwStatus("error");
    } finally {
      setPwSaving(false);
    }
  }

  return (
    <div className="profilePage">
      <div className="profileHero">
        <div className="phBlob b1" />
        <div className="phBlob b2" />
        <div className="phRow">
          <div className="phAvatarWrap">
            {session.avatarUrl ? (
              <img className="phAvatarImg" src={session.avatarUrl} alt="" />
            ) : (
              <div className="phAvatar">{initials(session.email)}</div>
            )}
            <button
              className="phCamBtn"
              onClick={() => fileInputRef.current?.click()}
              disabled={avatarUploading}
              title="Change photo"
            >
              {avatarUploading ? <Spinner size={13} /> : "📷"}
            </button>
            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={onPickAvatar} />
          </div>
          <div>
            <div className="phEyebrow">Your account</div>
            <p className="phName">{displayName}</p>
            <p className="phEmail">{session.email}</p>
          </div>
        </div>
        {avatarError && <p className="phAvatarError">{avatarError}</p>}
        <div className="phChipRow">
          <span className={`phChip ${session.plan === "premium" ? "plan-premium" : ""}`}>
            {session.plan === "premium" ? "⭐ Premium plan" : "Free plan"}
          </span>
        </div>
      </div>

      <div className="profileCard">
        <h2>Profile details</h2>
        <p className="profileHint">This name shows across the app — on your attempts, reports, and AI reviews.</p>

        <div className="profileField">
          <label>Display name</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Add your name" />
        </div>
        <div className="profileField">
          <label>Email address</label>
          <input type="text" value={session.email} disabled />
          <div className="profileFieldSub">Your email is your login — contact support to change it.</div>
        </div>

        <div className="profileActions">
          {nameStatus === "saved" && <span className="profileSavedTag">Saved</span>}
          {nameStatus === "error" && <span className="profileErrorTag">Couldn't save — try again</span>}
          <button
            className="profileBtnPrimary"
            onClick={saveName}
            disabled={savingName || name.trim() === (session.name ?? "")}
          >
            {savingName ? <Spinner size={14} inline /> : "Save changes"}
          </button>
        </div>
      </div>

      <div className="profileCard">
        <h2>Change password</h2>
        <p className="profileHint">Choose a strong password you don't use anywhere else.</p>

        <div className="profileField">
          <label>Current password</label>
          <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="••••••••" />
        </div>
        <div className="profileRow2">
          <div className="profileField">
            <label>New password</label>
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="At least 8 characters" />
            {newPassword && (
              <>
                <div className="profileStrength">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className={`profileStrengthSeg ${i < strength.score ? `filled tier${strength.score}` : ""}`} />
                  ))}
                </div>
                <div className="profileStrengthLabel">{strength.label}</div>
              </>
            )}
          </div>
          <div className="profileField">
            <label>Confirm new password</label>
            <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Repeat password" />
          </div>
        </div>

        <div className="profileActions">
          {pwStatus === "saved" && <span className="profileSavedTag">Password updated</span>}
          {pwError && <span className="profileErrorTag">{pwError}</span>}
          <button
            className="profileBtnPrimary"
            onClick={savePassword}
            disabled={pwSaving || !currentPassword || !newPassword || !confirmPassword}
          >
            {pwSaving ? <Spinner size={14} inline /> : "Update password"}
          </button>
        </div>
      </div>

      <div className="profileCard profileDangerCard">
        <div className="profileDangerRow">
          <div>
            <div className="profileDangerLabel">Log out of this device</div>
            <div className="profileFieldSub">You'll need to sign back in to see your attempts and vault.</div>
          </div>
          <button className="profileBtnDanger" onClick={onLogout}>
            <LogoutIcon /> Log out
          </button>
        </div>
      </div>
    </div>
  );
}
