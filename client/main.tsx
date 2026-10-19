import React from "react";
import { createRoot } from "react-dom/client";
import { FriendSession, type Ready } from "@rarefriends/friendsdk/react";

import "@fontsource/press-start-2p/latin-400.css";
import "@fontsource/silkscreen/latin-400.css";
import "@fontsource/silkscreen/latin-700.css";
import "./lib/arcade.css";

import { Arcade } from "./screens/Arcade.tsx";

type Cabinet = Readonly<{ pulls: number; genesisWon: number; generationsWon: number }>;

const root = document.getElementById("root");
if (!root) throw new Error("Rare Arcade: no #root to mount into.");

createRoot(root).render(
  <React.StrictMode>
    <FriendSession<Cabinet>
      title="Rare Arcade"
      loading="Warming up the cabinet…"
      closed="This session ended. Pick a Friend to play again."
      check={(game) => {
        if (!game.currency) throw new Error("This cabinet plays in USDG.");
      }}
    >
      {(ready: Ready<Cabinet>, paused: boolean) => <Arcade ready={ready} paused={paused} />}
    </FriendSession>
  </React.StrictMode>
);