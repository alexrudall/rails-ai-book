import Image from 'next/image'
import logoImage from '@/images/logo/logo_transparent.png'
import logoMark from '@/images/logo/transparent-logomark.png'

export function Logomark(props) {
  return (
    <Image
      className="h-10 object-scale-down flex cursor-pointer rounded-lg"
      src={logoMark}
      alt=""
    />
  )
}

export function Logo(props) {
  return (
    <Image
      className="object-scale-down flex cursor-pointer rounded-lg"
      src={logoImage}
      alt=""
      {...props}
    />
  )
}
