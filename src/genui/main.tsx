import { FluentProvider, MessageBar, MessageBarBody, webDarkTheme, webLightTheme } from "@fluentui/react-components";
import { StrictMode, useEffect, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { initAuth, type AuthHeaders } from "./auth.js";

// Served by the ParkAssist server itself, so API calls are same-origin.
const base = window.location.origin;

function useColorScheme(): "light" | "dark" {
  const query = "(prefers-color-scheme: dark)";
  const [dark, setDark] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const onChange = () => setDark(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);
  return dark ? "dark" : "light";
}

function Root() {
  const scheme = useColorScheme();
  const [auth, setAuth] = useState<AuthHeaders | Error>();

  useEffect(() => {
    initAuth(base).then(
      (headers) => setAuth(() => headers),
      (error: unknown) => setAuth(error instanceof Error ? error : new Error(String(error))),
    );
  }, []);

  let body: ReactNode = null;
  if (auth instanceof Error) {
    body = (
      <div style={{ padding: 24 }}>
        <MessageBar intent="error"><MessageBarBody>{auth.message}</MessageBarBody></MessageBar>
      </div>
    );
  } else if (auth) {
    body = <App base={base} authHeaders={auth} />;
  }

  return (
    <FluentProvider theme={scheme === "dark" ? webDarkTheme : webLightTheme} style={{ minHeight: "100dvh" }}>
      {body}
    </FluentProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
