import { api } from "@/lib/api";
import { getAccessToken } from "@/lib/session";

async function authHeaders() {
  const accessToken = await getAccessToken();
  if (!accessToken) throw new Error("No access token");
  return { Authorization: `Bearer ${accessToken}` };
}

/** ---------- Types ---------- */
export type UpdateNamePayload = {
  name: string;
};


export type RequestEmailChangePayload = {
  new_email: string;
};

export type ConfirmEmailChangePayload = {
  new_email: string;
  code: string;
};

export type RequestMobileChangePayload = {
  new_mobile: string;
};

export type ConfirmMobileChangePayload = {
  new_mobile: string;
  code: string;
};

export type BasicMessageResponse = {
  message: string;
};

/** ---------- Name ---------- */
export async function updateFullName(
  payload: UpdateNamePayload,
): Promise<BasicMessageResponse> {
  const headers = await authHeaders();
  const res = await api.patch<BasicMessageResponse>("/profile/name", payload, {
    headers,
  });
  return res.data;
}

/** ---------- Profile image ---------- */
export type UpdateProfileImageResponse = {
  message: string;
  profile_image_url: string;
};

export async function updateProfileImage(
  imageUri: string,
): Promise<UpdateProfileImageResponse> {
  const headers = await authHeaders();

  const formData = new FormData();
  const filename = imageUri.split("/").pop() || "photo.jpg";
  const match = /\.(\w+)$/.exec(filename);
  const type = match ? `image/${match[1]}` : "image/jpeg";

  formData.append("image", {
    uri: imageUri,
    name: filename,
    type,
  } as any);

  const res = await api.patch<UpdateProfileImageResponse>(
    "/profile/image",
    formData,
    {
      headers: {
        ...headers,
        "Content-Type": "multipart/form-data",
      },
    },
  );
  return res.data;
}

/** ---------- Email change (2-step) ---------- */
export async function requestEmailChange(
  payload: RequestEmailChangePayload,
): Promise<BasicMessageResponse> {
  const headers = await authHeaders();
  const res = await api.post<BasicMessageResponse>(
    "/profile/email-change/request",
    payload,
    { headers },
  );
  return res.data;
}

export async function confirmEmailChange(
  payload: ConfirmEmailChangePayload,
): Promise<BasicMessageResponse> {
  const headers = await authHeaders();
  const res = await api.post<BasicMessageResponse>(
    "/profile/email-change/confirm",
    payload,
    { headers },
  );
  return res.data;
}

export async function confirmMobileChange(
  payload: ConfirmMobileChangePayload,
): Promise<BasicMessageResponse> {
  const headers = await authHeaders();
  const res = await api.post<BasicMessageResponse>(
    "/profile/mobile-change/confirm",
    payload,
    { headers },
  );
  return res.data;
}

export async function deleteAccount(payload: { confirm: string }) {
  const headers = await authHeaders();
  const res = await api.post<BasicMessageResponse>("/profile/delete", payload, {
    headers,
  });
  return res.data;
}

/** ---------- Change password ---------- */
export type ChangePasswordPayload = {
  current_password: string;
  new_password: string;
};

export async function changePassword(
  payload: ChangePasswordPayload,
): Promise<BasicMessageResponse> {
  const headers = await authHeaders();
  const res = await api.post<BasicMessageResponse>(
    "/profile/change-password",
    payload,
    { headers },
  );
  return res.data;
}
