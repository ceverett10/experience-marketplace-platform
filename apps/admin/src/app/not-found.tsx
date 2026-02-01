export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen">
      <h1 className="text-4xl font-bold text-slate-900 mb-4">404</h1>
      <h2 className="text-xl text-slate-600 mb-8">Page Not Found</h2>
      <a href="/" className="px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition-colors">
        Return Home
      </a>
    </div>
  );
}
