import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import '@livekit/components-styles'
import { AuthProvider } from '@/components/shared/auth-provider'
const inter=Inter({subsets:['latin'],variable:'--font-latin',display:'swap',preload:false})
export const metadata: Metadata = { title: {default:'Learn With Me',template:'%s | Learn With Me'}, description:'Plateforme éducative tunisienne pour les élèves du baccalauréat : cours, exercices corrigés, annales et séances en direct.', applicationName:'Learn With Me', keywords:['baccalauréat tunisien','cours bac','mathématiques','physique','Learn With Me'], openGraph:{title:'Learn With Me',description:'Tout ce qu’il faut pour réussir le baccalauréat tunisien, au même endroit.',locale:'fr_FR',type:'website'} }
export const viewport: Viewport = { colorScheme:'light dark', themeColor:[{media:'(prefers-color-scheme: light)',color:'#f8faff'},{media:'(prefers-color-scheme: dark)',color:'#101426'}], width:'device-width', initialScale:1 }
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="fr" dir="ltr" data-scroll-behavior="smooth"><body className={`${inter.variable} antialiased`}><AuthProvider>{children}</AuthProvider></body></html>}
