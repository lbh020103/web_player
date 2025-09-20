export const metadata = {
  title: 'Web Audio Player',
  description: 'Upload and play audio files',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, sans-serif' }}>
        {children}
      </body>
    </html>
  )
}


