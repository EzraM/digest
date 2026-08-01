import { useMemo } from "react";

type UseStatusBarProps = {
  profileName: string | null;
  documentTitle: string | null;
};

export const useStatusBar = ({
  profileName,
  documentTitle,
}: UseStatusBarProps) => {
  const breadcrumbText = useMemo(() => {
    const parts = [profileName || "Profile", documentTitle || "Untitled"];
    return parts.join(" / ");
  }, [profileName, documentTitle]);

  return {
    breadcrumbText,
  };
};
