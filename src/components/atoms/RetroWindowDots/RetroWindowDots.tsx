import { useTheme } from "../../../contexts/ThemeContext";

export const RetroWindowDots = () => {
  const { theme } = useTheme();
  if (theme !== "win95" && theme !== "classic" && theme !== "winamp" && theme !== "aqua") return null;

  return (
    <div className="flex items-center gap-[6px] shrink-0" aria-hidden>
      <div className="w-[13px] h-[13px] rounded-full bg-[#FF605C] border border-[#E04E46]" />
      <div className="w-[13px] h-[13px] rounded-full bg-[#FFBD44] border border-[#DFA23A]" />
      <div className="w-[13px] h-[13px] rounded-full bg-[#00CA4E] border border-[#00B344]" />
    </div>
  );
};
