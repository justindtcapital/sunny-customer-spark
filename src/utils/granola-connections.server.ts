import { createServerOnlyFn } from "@tanstack/react-start";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function encryptionKey() {
  const secret = process.env.GRANOLA_TOKEN_SECRET;
  if (!secret) throw new Error("Granola connection storage is not configured.");
  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return crypto.subtle.importKey("raw", hash, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export const encryptGranolaKey = createServerOnlyFn(async (plaintext: string, userId: string) => {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: encoder.encode(userId) }, await encryptionKey(), encoder.encode(plaintext));
  return `${Buffer.from(iv).toString("base64")}.${Buffer.from(ciphertext).toString("base64")}`;
});

export const decryptGranolaKey = createServerOnlyFn(async (stored: string, userId: string) => {
  const [iv, ciphertext] = stored.split(".");
  if (!iv || !ciphertext) throw new Error("Reconnect your Granola account.");
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: Buffer.from(iv, "base64"), additionalData: encoder.encode(userId) }, await encryptionKey(), Buffer.from(ciphertext, "base64"));
  return decoder.decode(plaintext);
});

export const granolaConnectionStatus = createServerOnlyFn(async (userId: string) => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.from("personal_granola_connections").select("connected_at").eq("user_id", userId).maybeSingle();
  if (error) throw new Error("Couldn't load your Granola connection.");
  return { connected: !!data, connectedAt: data?.connected_at || "" };
});

export const loadGranolaKey = createServerOnlyFn(async (userId: string) => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.from("personal_granola_connections").select("key_ciphertext").eq("user_id", userId).maybeSingle();
  if (error) throw new Error("Couldn't load your Granola connection.");
  if (!data) throw new Error("Connect your own Granola account first.");
  return decryptGranolaKey(data.key_ciphertext, userId);
});

export const saveGranolaKey = createServerOnlyFn(async (userId: string, apiKey: string) => {
  const response = await fetch("https://public-api.granola.ai/v1/notes?limit=1", {
    headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(15_000),
  });
  // Do not log or forward provider error text: it could echo the submitted key.
  if (!response.ok) throw new Error(`Granola rejected this connection (${response.status}). Check the key and your Granola plan permissions.`);
  await response.arrayBuffer();
  const ciphertext = await encryptGranolaKey(apiKey, userId);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("personal_granola_connections").upsert({ user_id: userId, key_ciphertext: ciphertext, updated_at: new Date().toISOString() });
  if (error) throw new Error("Couldn't save your Granola connection.");
  return { connected: true };
});

export const disconnectGranola = createServerOnlyFn(async (userId: string) => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("personal_granola_connections").delete().eq("user_id", userId);
  if (error) throw new Error("Couldn't disconnect your Granola account.");
  return { connected: false };
});