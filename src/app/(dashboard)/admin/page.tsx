import Image from "next/image";

const AdminPage = () => {
  return (
    <main className="flex-1 p-4 md:p-6 flex flex-col gap-4">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Image src="/logo.png" alt="SCSCO logo" width={42} height={42} className="rounded-full" />
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-gray-500">
              Official college information
            </p>
            <h1 className="text-2xl font-semibold">archita-2022-23</h1>
          </div>
        </div>
        <a
          href="/archita-2022-23.pdf"
          download
          className="rounded-md bg-lamaSky px-4 py-2 text-sm font-medium"
        >
          Download PDF
        </a>
        <a
          href="/archita-2022-23-ocr.txt"
          target="_blank"
          rel="noreferrer"
          className="rounded-md bg-lamaYellow px-4 py-2 text-sm font-medium"
        >
          View OCR data
        </a>
      </header>
      <section className="min-h-[calc(100vh-9rem)] overflow-hidden rounded-md bg-white shadow-sm">
        <iframe
          title="archita-2022-23 report"
          src="/archita-2022-23.pdf"
          className="h-[calc(100vh-9rem)] min-h-[680px] w-full border-0"
        />
      </section>
      <footer className="flex items-center justify-center gap-2 border-t border-gray-200 bg-white py-3 text-sm font-medium text-gray-700">
        <Image src="/logo.png" alt="SCSCO logo" width={22} height={22} className="rounded-full" />
        <span>SCSCO</span>
      </footer>
    </main>
  );
};

export default AdminPage;
