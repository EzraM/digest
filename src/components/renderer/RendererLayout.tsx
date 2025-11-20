import { ReactNode } from "react";
import { AppShell } from "@mantine/core";

type RendererLayoutProps = {
  navbar: ReactNode;
  main: ReactNode;
  aside: ReactNode;
  isDebugSidebarVisible: boolean;
};

export const RendererLayout = ({
  navbar,
  main,
  aside,
  isDebugSidebarVisible,
}: RendererLayoutProps) => (
  <AppShell
    navbar={{
      width: 320,
      breakpoint: "sm",
    }}
    aside={{
      width: 400,
      breakpoint: "sm",
      collapsed: { desktop: !isDebugSidebarVisible },
    }}
    padding="md"
  >
    <AppShell.Navbar p="md">{navbar}</AppShell.Navbar>
    <AppShell.Main>{main}</AppShell.Main>
    <AppShell.Aside p="md">{aside}</AppShell.Aside>
  </AppShell>
);
