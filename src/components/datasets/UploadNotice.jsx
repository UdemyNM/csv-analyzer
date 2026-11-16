/** アップロード直後だけ分析画面の上部に出す帯。出すかどうかは呼び出し側が決める。 */
export function UploadNotice() {
  return (
    <p role="status" className="upload-notice">
      アップロードしました
    </p>
  );
}
