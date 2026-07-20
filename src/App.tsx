import { ThemeProvider } from "@primer/react";
import { RepoIcon } from "@primer/octicons-react";

export function App() {
  return (
    <ThemeProvider colorMode="auto">
      <main className="app-shell" aria-label="RepoPuck">
        <RepoIcon size={20} aria-hidden="true" />
        <span>RepoPuck</span>
      </main>
    </ThemeProvider>
  );
}
