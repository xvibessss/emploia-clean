import { useMutation, useQuery } from "@tanstack/react-query";

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
    credentials: "include",
  });
  const data = await res.json();
  if (!res.ok) throw { ...data, status: res.status };
  return data;
}

export function useGetMe(opts?: { query?: Record<string, unknown> }) {
  return useQuery({
    queryKey: ["/api/auth/me"],
    queryFn: () => apiFetch("/auth/me"),
    ...opts?.query,
  });
}

export function useLogin(opts?: { mutation?: Record<string, unknown> }) {
  return useMutation({
    mutationFn: ({ data }: { data: { email: string; password: string } }) =>
      apiFetch("/auth/login", { method: "POST", body: JSON.stringify(data) }),
    ...opts?.mutation,
  });
}

export function useRegister(opts?: { mutation?: Record<string, unknown> }) {
  return useMutation({
    mutationFn: ({ data }: { data: { name: string; email: string; password: string } }) =>
      apiFetch("/auth/register", { method: "POST", body: JSON.stringify(data) }),
    ...opts?.mutation,
  });
}

export function useLogout(opts?: { mutation?: Record<string, unknown> }) {
  return useMutation({
    mutationFn: () => apiFetch("/auth/logout", { method: "POST" }),
    ...opts?.mutation,
  });
}

export function useGenerateCv(opts?: { mutation?: Record<string, unknown> }) {
  return useMutation({
    mutationFn: ({ data }: { data: { jobOffer: string; profile: string } }) =>
      apiFetch("/generate/cv", { method: "POST", body: JSON.stringify(data) }),
    ...opts?.mutation,
  });
}

export function useGenerateCoverLetter(opts?: { mutation?: Record<string, unknown> }) {
  return useMutation({
    mutationFn: ({ data }: { data: { jobOffer: string; profile: string } }) =>
      apiFetch("/generate/cover-letter", { method: "POST", body: JSON.stringify(data) }),
    ...opts?.mutation,
  });
}

export function useGenerateAtsScore(opts?: { mutation?: Record<string, unknown> }) {
  return useMutation({
    mutationFn: ({ data }: { data: { jobOffer: string; cvText: string } }) =>
      apiFetch("/generate/ats-score", { method: "POST", body: JSON.stringify(data) }),
    ...opts?.mutation,
  });
}
