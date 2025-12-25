import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useTheme } from '@/lib/contexts/theme.context';
import { BookOpen, Users, ShoppingCart, Package, DollarSign, Clock, FileText, BarChart, AlertCircle } from 'lucide-react-native';

export default function HowToUseScreen() {
  const { theme } = useTheme();

  const Section = ({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) => (
    <View style={[styles.section, { backgroundColor: theme.card }]}>
      <View style={styles.sectionHeader}>
        {icon}
        <Text style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text>
      </View>
      <View style={styles.sectionContent}>
        {children}
      </View>
    </View>
  );

  const Subsection = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <View style={styles.subsection}>
      <Text style={[styles.subsectionTitle, { color: theme.text }]}>{title}</Text>
      {children}
    </View>
  );

  const BulletPoint = ({ text, sub }: { text: string; sub?: boolean }) => (
    <View style={[styles.bulletPoint, sub && styles.bulletPointSub]}>
      <Text style={[styles.bullet, { color: theme.textSecondary }]}>{sub ? '◦' : '•'}</Text>
      <Text style={[styles.bulletText, { color: sub ? theme.textSecondary : theme.text }]}>{text}</Text>
    </View>
  );

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.content}>
        <View style={[styles.heroCard, { backgroundColor: theme.primary }]}>
          <BookOpen size={32} color="#FFF" />
          <Text style={styles.heroTitle}>How to Use FoodCartOps</Text>
          <Text style={styles.heroSubtitle}>Complete guide to managing your food cart business</Text>
        </View>

        <Section title="Quick Start" icon={<AlertCircle size={20} color={theme.primary} />}>
          <Text style={[styles.infoText, { color: theme.text }]}>
            Get your business running in 5 minutes
          </Text>
          <View style={styles.stepsList}>
            <Text style={[styles.step, { color: theme.text }]}>1. Create carts (Dashboard → tap cart icon)</Text>
            <Text style={[styles.step, { color: theme.text }]}>2. Add products with prices (Products tab)</Text>
            <Text style={[styles.step, { color: theme.text }]}>3. Create worker accounts (Users tab)</Text>
            <Text style={[styles.step, { color: theme.text }]}>4. Assign shifts to workers (Dashboard → Shifts)</Text>
            <Text style={[styles.step, { color: theme.text }]}>5. Workers start shifts and begin selling</Text>
          </View>
        </Section>

        <Section title="Login & Roles" icon={<Users size={20} color={theme.primary} />}>
          <Subsection title="Logging In">
            <BulletPoint text="All users login with a 4-8 digit PIN" />
            <BulletPoint text="No username required — PIN identifies the user" />
          </Subsection>

          <Subsection title="User Roles">
            <BulletPoint text="Boss / Boss2 — Full access to all features" />
            <BulletPoint sub text="Create and manage users, carts, products" />
            <BulletPoint sub text="View all sales, expenses, and reports" />
            <BulletPoint sub text="Approve/reject expenses" />
            <BulletPoint sub text="Create and view settlements" />
            
            <BulletPoint text="Developer — Full access + developer tools" />
            <BulletPoint sub text="All Boss permissions" />
            <BulletPoint sub text="Access to database debug screen" />
            <BulletPoint sub text="Ability to reset/wipe data" />
            
            <BulletPoint text="Worker — Shift-based access" />
            <BulletPoint sub text="Start/end shifts" />
            <BulletPoint sub text="Make sales and accept payments" />
            <BulletPoint sub text="Submit expenses for approval" />
            <BulletPoint sub text="Cannot view other workers' data" />
            
            <BulletPoint text="Inventory Clerk — Inventory management only" />
            <BulletPoint sub text="Add, edit, and delete inventory items" />
            <BulletPoint sub text="View inventory levels" />
            <BulletPoint sub text="No access to sales or financial data" />
          </Subsection>
        </Section>

        <Section title="Boss Dashboard" icon={<BarChart size={20} color={theme.primary} />}>
          <Subsection title="Overview Tab">
            <BulletPoint text="View real-time sales across all carts" />
            <BulletPoint text="See active shifts and current workers" />
            <BulletPoint text="Monitor daily/weekly/monthly revenue" />
            <BulletPoint text="Quick access to pending expenses" />
          </Subsection>

          <Subsection title="Carts Management">
            <BulletPoint text="Create new carts with names and optional notes" />
            <BulletPoint text="Notes are visible to workers when they start shifts" />
            <BulletPoint text="Edit cart details or delete inactive carts" />
            <BulletPoint text="Assign workers to specific carts via shifts" />
          </Subsection>

          <Subsection title="Calendar & Reports">
            <BulletPoint text="Access via Dashboard (tap calendar icon)" />
            <BulletPoint text="View sales, expenses, and net profit by period" />
            <BulletPoint text="See 70/30 split (Operation Manager vs Owner)" />
            <BulletPoint text="Export data as CSV via email" />
            <BulletPoint text="Charts auto-update when new data is added" />
          </Subsection>

          <Subsection title="Settlements">
            <BulletPoint text="Access pending settlements from Dashboard" />
            <BulletPoint text="Review shift details, sales, expenses" />
            <BulletPoint text="Save settlements for permanent records" />
            <BulletPoint text="Saved settlements include expenses snapshot" />
            <BulletPoint text="View saved settlements anytime" />
          </Subsection>
        </Section>

        <Section title="Users & Workers" icon={<Users size={20} color={theme.primary} />}>
          <Subsection title="Creating Users">
            <BulletPoint text="Go to Users tab" />
            <BulletPoint text="Tap 'Add User' button" />
            <BulletPoint text="Enter name, assign role, set PIN" />
            <BulletPoint text="User can immediately login with their PIN" />
          </Subsection>

          <Subsection title="Managing Users">
            <BulletPoint text="Reset user PIN if forgotten" />
            <BulletPoint text="Activate/deactivate user accounts" />
            <BulletPoint text="Inactive users cannot login" />
            <BulletPoint text="Cannot delete users (deactivate instead)" />
          </Subsection>

          <Subsection title="Assigning Shifts">
            <BulletPoint text="From Dashboard, navigate to Shifts" />
            <BulletPoint text="Assign worker + cart + date" />
            <BulletPoint text="Worker sees assigned shifts when they login" />
            <BulletPoint text="Worker starts shift when ready to begin work" />
          </Subsection>
        </Section>

        <Section title="Products & Categories" icon={<Package size={20} color={theme.primary} />}>
          <Subsection title="Products Tab">
            <BulletPoint text="Create product categories first" />
            <BulletPoint text="Add products with names, prices, descriptions" />
            <BulletPoint text="Products appear in Worker's 'New Sale' screen" />
            <BulletPoint text="Edit prices anytime without affecting past sales" />
            <BulletPoint text="Delete products not in use" />
          </Subsection>

          <Subsection title="Best Practices">
            <BulletPoint text="Use clear, descriptive product names" />
            <BulletPoint text="Group similar items in categories" />
            <BulletPoint text="Keep prices up to date" />
          </Subsection>
        </Section>

        <Section title="Expenses Management" icon={<DollarSign size={20} color={theme.primary} />}>
          <Subsection title="Worker Submits Expense">
            <BulletPoint text="Worker navigates to Expenses tab" />
            <BulletPoint text="Taps 'Submit Expense'" />
            <BulletPoint text="Enters amount, category, notes" />
            <BulletPoint text="Can attach photos (optional)" />
            <BulletPoint text="Submits for Boss approval" />
          </Subsection>

          <Subsection title="Boss Reviews Expenses">
            <BulletPoint text="Go to Expenses tab (Boss dashboard)" />
            <BulletPoint text="See all pending expenses" />
            <BulletPoint text="Review details, photos, worker info" />
            <BulletPoint text="Approve or reject with reason" />
            <BulletPoint text="Approved expenses count toward settlements" />
          </Subsection>

          <Subsection title="Deletion Rules">
            <BulletPoint text="Workers can delete their own submitted expenses" />
            <BulletPoint text="Boss can delete any expense" />
            <BulletPoint text="Cannot delete approved expenses (deactivate instead)" />
          </Subsection>
        </Section>

        <Section title="Worker Functions" icon={<Clock size={20} color={theme.primary} />}>
          <Subsection title="Starting a Shift">
            <BulletPoint text="Login with PIN" />
            <BulletPoint text="View assigned shifts" />
            <BulletPoint text="Tap 'Start Shift'" />
            <BulletPoint text="Enter starting cash amount" />
            <BulletPoint text="Read cart notes (if any)" />
          </Subsection>

          <Subsection title="Making Sales">
            <BulletPoint text="Tap 'New Sale' on worker dashboard" />
            <BulletPoint text="Select products and quantities" />
            <BulletPoint text="Choose payment method (Cash/GCash/Card)" />
            <BulletPoint text="Confirm sale" />
            <BulletPoint text="Sale is immediately recorded" />
          </Subsection>

          <Subsection title="Ending a Shift">
            <BulletPoint text="Tap 'End Shift' when work is done" />
            <BulletPoint text="Enter ending cash amount" />
            <BulletPoint text="Add optional notes" />
            <BulletPoint text="Shift becomes pending settlement for Boss" />
            <BulletPoint text="Worker can now logout" />
          </Subsection>
        </Section>

        <Section title="Inventory Module" icon={<ShoppingCart size={20} color={theme.primary} />}>
          <Subsection title="Access (if role permits)">
            <BulletPoint text="Boss, Boss2, Developer, Inventory Clerk can access" />
            <BulletPoint text="Separate bottom navigation tabs" />
            <BulletPoint text="Inventory, Profile, Settings" />
          </Subsection>

          <Subsection title="Managing Inventory">
            <BulletPoint text="Add new inventory items with name, quantity, unit" />
            <BulletPoint text="Edit existing items to update stock levels" />
            <BulletPoint text="Delete items no longer needed" />
            <BulletPoint text="Track inventory separately from sales products" />
          </Subsection>

          <Subsection title="Inventory Settings">
            <BulletPoint text="Change PIN (same as other roles)" />
            <BulletPoint text="Toggle Dark/Light mode" />
            <BulletPoint text="Theme applies across all Inventory screens" />
          </Subsection>
        </Section>

        <Section title="Data & Storage" icon={<FileText size={20} color={theme.primary} />}>
          <Text style={[styles.infoText, { color: theme.text }]}>
            FoodCartOps stores all business data on-device using SQLite database. This ensures fast performance and works offline.
          </Text>
          <BulletPoint text="All data is local to your device" />
          <BulletPoint text="No internet required for daily operations" />
          <BulletPoint text="Cloud sync depends on current build/version" />
          <BulletPoint text="Use export features to backup critical data" />
        </Section>

        <View style={[styles.footer, { backgroundColor: theme.card }]}>
          <Text style={[styles.footerText, { color: theme.textSecondary }]}>
            Need more help? Contact your system administrator or developer.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  heroCard: {
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: 20,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '700' as const,
    color: '#FFF',
    marginTop: 12,
    textAlign: 'center',
  },
  heroSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.9)',
    marginTop: 4,
    textAlign: 'center',
  },
  section: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600' as const,
  },
  sectionContent: {
    gap: 12,
  },
  subsection: {
    marginBottom: 16,
  },
  subsectionTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    marginBottom: 8,
  },
  bulletPoint: {
    flexDirection: 'row',
    paddingVertical: 4,
    paddingLeft: 4,
  },
  bulletPointSub: {
    paddingLeft: 20,
  },
  bullet: {
    fontSize: 16,
    marginRight: 8,
    width: 16,
  },
  bulletText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  infoText: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  stepsList: {
    gap: 8,
  },
  step: {
    fontSize: 14,
    lineHeight: 20,
    paddingVertical: 4,
  },
  footer: {
    padding: 16,
    borderRadius: 12,
    marginTop: 8,
  },
  footerText: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
});
