import { useMemo } from "react";

type UseStatusBarProps = {
  profileName: string | null;
  documentTitle: string | null;
  onToggleSidebar: () => void;
};

export const useStatusBar = ({
  profileName,
  documentTitle,
  onToggleSidebar,
}: UseStatusBarProps) => {
  const breadcrumbText = useMemo(() => {
    const parts = [profileName || "Profile", documentTitle || "Untitled"];
    return parts.join(" / ");
  }, [profileName, documentTitle]);

  const handleClick = () => {
    onToggleSidebar();
  };

  return {
    breadcrumbText,
    handleClick,
  };
};
