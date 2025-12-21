import { Link, Stack } from 'expo-router';
import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { useTheme } from '@/lib/contexts/theme.context';

export default function NotFoundScreen() {
  const { theme } = useTheme();

  return (
    <>
      <Stack.Screen options={{ title: 'Oops!' }} />
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <Text style={[styles.text, { color: theme.text }]}>This screen doesn&apos;t exist.</Text>

        <Link href="/" style={styles.link}>
          <Text style={[styles.linkText, { color: theme.primary }]}>Go to login</Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  text: {
    fontSize: 18,
    marginBottom: 10,
  },
  link: {
    marginTop: 15,
    paddingVertical: 15,
  },
  linkText: {
    fontSize: 14,
  },
});
