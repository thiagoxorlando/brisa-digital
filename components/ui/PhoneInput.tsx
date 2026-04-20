"use client";

import { useEffect, useRef, useState } from "react";

export const PHONE_COUNTRY_CODES = [
  { code: "+55",  flag: "🇧🇷", label: "BR" },
  { code: "+1",   flag: "🇺🇸", label: "US" },
  { code: "+1",   flag: "🇨🇦", label: "CA" },
  { code: "+44",  flag: "🇬🇧", label: "UK" },
  { code: "+351", flag: "🇵🇹", label: "PT" },
  { code: "+34",  flag: "🇪🇸", label: "ES" },
  { code: "+33",  flag: "🇫🇷", label: "FR" },
  { code: "+49",  flag: "🇩🇪", label: "DE" },
  { code: "+39",  flag: "🇮🇹", label: "IT" },
  { code: "+31",  flag: "🇳🇱", label: "NL" },
  { code: "+32",  flag: "🇧🇪", label: "BE" },
  { code: "+41",  flag: "🇨🇭", label: "CH" },
  { code: "+43",  flag: "🇦🇹", label: "AT" },
  { code: "+46",  flag: "🇸🇪", label: "SE" },
  { code: "+47",  flag: "🇳🇴", label: "NO" },
  { code: "+45",  flag: "🇩🇰", label: "DK" },
  { code: "+358", flag: "🇫🇮", label: "FI" },
  { code: "+52",  flag: "🇲🇽", label: "MX" },
  { code: "+54",  flag: "🇦🇷", label: "AR" },
  { code: "+56",  flag: "🇨🇱", label: "CL" },
  { code: "+57",  flag: "🇨🇴", label: "CO" },
  { code: "+51",  flag: "🇵🇪", label: "PE" },
  { code: "+58",  flag: "🇻🇪", label: "VE" },
  { code: "+593", flag: "🇪🇨", label: "EC" },
  { code: "+595", flag: "🇵🇾", label: "PY" },
  { code: "+598", flag: "🇺🇾", label: "UY" },
  { code: "+591", flag: "🇧🇴", label: "BO" },
  { code: "+61",  flag: "🇦🇺", label: "AU" },
  { code: "+64",  flag: "🇳🇿", label: "NZ" },
  { code: "+81",  flag: "🇯🇵", label: "JP" },
  { code: "+82",  flag: "🇰🇷", label: "KR" },
  { code: "+86",  flag: "🇨🇳", label: "CN" },
  { code: "+91",  flag: "🇮🇳", label: "IN" },
  { code: "+65",  flag: "🇸🇬", label: "SG" },
  { code: "+60",  flag: "🇲🇾", label: "MY" },
  { code: "+66",  flag: "🇹🇭", label: "TH" },
  { code: "+63",  flag: "🇵🇭", label: "PH" },
  { code: "+62",  flag: "🇮🇩", label: "ID" },
  { code: "+971", flag: "🇦🇪", label: "AE" },
  { code: "+966", flag: "🇸🇦", label: "SA" },
  { code: "+972", flag: "🇮🇱", label: "IL" },
  { code: "+90",  flag: "🇹🇷", label: "TR" },
  { code: "+7",   flag: "🇷🇺", label: "RU" },
  { code: "+380", flag: "🇺🇦", label: "UA" },
  { code: "+48",  flag: "🇵🇱", label: "PL" },
  { code: "+420", flag: "🇨🇿", label: "CZ" },
  { code: "+36",  flag: "🇭🇺", label: "HU" },
  { code: "+40",  flag: "🇷🇴", label: "RO" },
  { code: "+27",  flag: "🇿🇦", label: "ZA" },
  { code: "+234", flag: "🇳🇬", label: "NG" },
  { code: "+254", flag: "🇰🇪", label: "KE" },
  { code: "+20",  flag: "🇪🇬", label: "EG" },
  { code: "+212", flag: "🇲🇦", label: "MA" },
];

function parsePhoneValue(value: string): { code: string; num: string } {
  for (const cc of PHONE_COUNTRY_CODES) {
    if (value.startsWith(cc.code + " ")) {
      return { code: cc.code, num: value.slice(cc.code.length + 1) };
    }
  }
  // Might be just a bare number (no prefix stored yet)
  return { code: "+55", num: value };
}

export default function PhoneInput({
  value,
  onChange,
  hasError = false,
  placeholder = "11 99999-9999",
  required,
}: {
  value: string;
  onChange: (full: string) => void;
  hasError?: boolean;
  placeholder?: string;
  required?: boolean;
}) {
  const initialized = useRef(false);
  const [code, setCode] = useState("+55");
  const [num,  setNum]  = useState("");

  // Sync once when the value becomes non-empty (e.g. data loads from DB)
  useEffect(() => {
    if (!initialized.current && value) {
      const parsed = parsePhoneValue(value);
      setCode(parsed.code);
      setNum(parsed.num);
      initialized.current = true;
    }
  }, [value]);

  const borderCls = hasError
    ? "border-rose-300 focus-within:border-rose-400"
    : "border-zinc-200 hover:border-zinc-300 focus-within:border-zinc-900";

  function handleCodeChange(newCode: string) {
    setCode(newCode);
    onChange(num ? `${newCode} ${num}` : "");
  }

  function handleNumChange(newNum: string) {
    setNum(newNum);
    onChange(newNum ? `${code} ${newNum}` : "");
  }

  return (
    <div className={`flex rounded-xl border transition-colors overflow-hidden bg-white ${borderCls}`}>
      {/* Country code dropdown */}
      <div className="relative flex-shrink-0 border-r border-zinc-200">
        <select
          value={code}
          onChange={(e) => handleCodeChange(e.target.value)}
          className="h-full pl-3 pr-7 text-[13px] font-medium text-zinc-700 bg-transparent appearance-none cursor-pointer focus:outline-none"
        >
          {PHONE_COUNTRY_CODES.map((cc) => (
            <option key={`${cc.flag}-${cc.code}-${cc.label}`} value={cc.code}>
              {cc.flag} {cc.code} {cc.label}
            </option>
          ))}
        </select>
        <div className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-400">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>
      {/* Number field */}
      <input
        type="tel"
        required={required}
        placeholder={placeholder}
        value={num}
        onChange={(e) => handleNumChange(e.target.value)}
        className="flex-1 px-3 py-3 text-[14px] bg-transparent focus:outline-none placeholder:text-zinc-400 min-w-0"
      />
    </div>
  );
}
