"use client";

import { useEffect, useState } from "react";
import { isValidUsername, normaliseUsername } from "@/lib/username";

export const PLAY_AS_STORAGE_KEY = "rdgw.playAsUsername";
const PLAY_AS_EVENT = "rdgw:play-as-changed";

function readStoredUsername() {
  if (typeof window === "undefined") return "";

  const username = window.localStorage.getItem(PLAY_AS_STORAGE_KEY) ?? "";
  return isValidUsername(username) ? username : "";
}

function emitPlayAsChanged() {
  window.dispatchEvent(new Event(PLAY_AS_EVENT));
}

export function setPlayAsUsername(value: string) {
  const username = normaliseUsername(value);
  if (!isValidUsername(username)) return false;

  window.localStorage.setItem(PLAY_AS_STORAGE_KEY, username);
  emitPlayAsChanged();
  return true;
}

export function clearPlayAsUsername() {
  window.localStorage.removeItem(PLAY_AS_STORAGE_KEY);
  emitPlayAsChanged();
}

export function usePlayAsUsername() {
  const [username, setUsername] = useState("");

  useEffect(() => {
    function sync() {
      setUsername(readStoredUsername());
    }

    sync();
    window.addEventListener(PLAY_AS_EVENT, sync);
    window.addEventListener("storage", sync);

    return () => {
      window.removeEventListener(PLAY_AS_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return username;
}
