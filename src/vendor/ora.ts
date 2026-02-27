// Minimal stub for ora
export default function ora(_opts?: any) {
  return {
    start: () => ({ stop: () => {}, succeed: () => {}, fail: () => {} }),
  };
}
