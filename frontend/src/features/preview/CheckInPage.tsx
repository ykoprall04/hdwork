import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePreview } from "./context";
import { workStatus, type WorkStatus } from "./work-status";
import CheckInView from "../workspace-ui/CheckInView";
export default function CheckInPage() {
  const { state, dispatch } = usePreview();
  const [status, setStatus] = useState<WorkStatus>(workStatus(state) === "OFFLINE" ? "ONLINE" : workStatus(state));
  const navigate = useNavigate();
  return <CheckInView status={status} onChange={setStatus} onContinue={() => { dispatch({ type: "work-status", status }); navigate("/preview/jobs"); }} description="Status terakhir disimpan per akun pada browser ini. Status OFFLINE tetap mengizinkan penanganan order sendiri." footer="Refresh atau menutup browser tidak membuat Anda OFFLINE. Hanya tombol Logout aplikasi yang mengubah status ke OFFLINE. Status ini simulasi lokal, bukan status kehadiran backend." />;
}
