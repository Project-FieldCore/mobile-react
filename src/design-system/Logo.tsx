import { Image, StyleSheet } from 'react-native';

const LOGO_ASPECT_RATIO = 1024 / 1536;

type BrandLogoProps = {
  width?: number;
};

export function BrandLogo({ width = 220 }: BrandLogoProps) {
  return (
    <Image
      source={require('../../assets/logo_transparent.png')}
      resizeMode="contain"
      style={[styles.logo, { width, height: width * LOGO_ASPECT_RATIO }]}
    />
  );
}

const styles = StyleSheet.create({
  logo: {
    alignSelf: 'center',
  },
});
