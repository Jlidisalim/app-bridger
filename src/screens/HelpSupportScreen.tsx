import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  TextInput,
  Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, SPACING } from '../theme/theme';
import { Typography } from '../components/Typography';
import { useNavigation } from '@react-navigation/native';
import { ArrowLeft, MessageCircle, Mail, ChevronRight, FileText, Send } from 'lucide-react-native';

interface FAQ {
  id: string;
  question: string;
  answer: string;
}

const FAQs: FAQ[] = [
  {
    id: '1',
    question: 'How does Bridger work?',
    answer: 'Bridger connects people who need packages delivered with travelers going the same route. You can either send a package or travel with packages.',
  },
  {
    id: '2',
    question: 'How do I verify my identity?',
    answer: 'Go to Profile > KYC Upload and submit your ID document and a selfie. Verification usually takes 24-48 hours.',
  },
  {
    id: '3',
    question: 'How are payments handled?',
    answer: 'Payments are held in escrow until the package is delivered. Once confirmed, funds are released to the traveler.',
  },
  {
    id: '4',
    question: 'What if something goes wrong?',
    answer: 'You can file a dispute from the deal details screen. Our support team will help resolve the issue.',
  },
];

export const HelpSupportScreen: React.FC = () => {
  const navigation = useNavigation();
  const [expandedFAQ, setExpandedFAQ] = useState<string | null>(null);
  const [showContactForm, setShowContactForm] = useState(false);
  const [message, setMessage] = useState('');

  const handleFAQPress = (faqId: string) => {
    setExpandedFAQ(expandedFAQ === faqId ? null : faqId);
  };

  const handleContactSupport = () => {
    setShowContactForm(true);
  };

  const handleSendMessage = () => {
    if (!message.trim()) {
      Alert.alert('Error', 'Please enter a message');
      return;
    }
    Alert.alert('Message Sent', 'Our support team will get back to you shortly.');
    setMessage('');
    setShowContactForm(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <ArrowLeft color={COLORS.background.slate[900]} size={24} />
        </TouchableOpacity>
        <Typography size="lg" weight="bold">Help & Support</Typography>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Quick Actions */}
        <View style={styles.actionsSection}>
          <TouchableOpacity style={styles.actionItem} onPress={handleContactSupport}>
            <View style={[styles.actionIcon, { backgroundColor: '#e3f2fd' }]}>
              <MessageCircle size={24} color="#1976d2" />
            </View>
            <View style={styles.actionContent}>
              <Typography size="md" weight="bold">Chat with Support</Typography>
              <Typography size="sm" color="#666">Get help from our team</Typography>
            </View>
            <ChevronRight size={20} color="#999" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionItem}>
            <View style={[styles.actionIcon, { backgroundColor: '#fff3e0' }]}>
              <Mail size={24} color="#f57c00" />
            </View>
            <View style={styles.actionContent}>
              <Typography size="md" weight="bold">Email Support</Typography>
              <Typography size="sm" color="#666">support@bridger.app</Typography>
            </View>
            <ChevronRight size={20} color="#999" />
          </TouchableOpacity>
        </View>

        {/* FAQ Section */}
        <View style={styles.faqSection}>
          <Typography size="md" weight="bold" style={styles.sectionTitle}>
            Frequently Asked Questions
          </Typography>

          {FAQs.map((faq) => (
            <TouchableOpacity 
              key={faq.id} 
              style={styles.faqItem}
              onPress={() => handleFAQPress(faq.id)}
            >
              <View style={styles.faqQuestion}>
                <FileText size={18} color={COLORS.primary} />
                <Typography size="sm" weight="bold" style={{ flex: 1, marginLeft: 8 }}>
                  {faq.question}
                </Typography>
                <ChevronRight 
                  size={18} 
                  color="#999" 
                  style={{ transform: expandedFAQ === faq.id ? [{ rotate: '90deg' }] : [] }} 
                />
              </View>
              {expandedFAQ === faq.id && (
                <View style={styles.faqAnswer}>
                  <Typography size="sm" color="#666">{faq.answer}</Typography>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* Contact Form */}
        {showContactForm && (
          <View style={styles.contactForm}>
            <Typography size="md" weight="bold" style={styles.sectionTitle}>
              Contact Support
            </Typography>
            <TextInput
              style={styles.textArea}
              value={message}
              onChangeText={setMessage}
              placeholder="Describe your issue..."
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
            <TouchableOpacity style={styles.sendButton} onPress={handleSendMessage}>
              <Send size={18} color="#fff" />
              <Typography size="md" weight="bold" color="#fff" style={{ marginLeft: 8 }}>
                Send Message
              </Typography>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  backButton: {
    padding: 4,
  },
  content: {
    padding: SPACING.md,
  },
  actionsSection: {
    marginBottom: SPACING.lg,
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: SPACING.md,
    borderRadius: 12,
    marginBottom: SPACING.sm,
  },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionContent: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  faqSection: {
    marginBottom: SPACING.lg,
  },
  sectionTitle: {
    marginBottom: SPACING.sm,
  },
  faqItem: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: SPACING.sm,
    overflow: 'hidden',
  },
  faqQuestion: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
  },
  faqAnswer: {
    padding: SPACING.md,
    paddingTop: 0,
    backgroundColor: '#f8f9fa',
  },
  contactForm: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: SPACING.md,
  },
  textArea: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: SPACING.md,
    minHeight: 100,
    fontSize: 14,
    marginBottom: SPACING.md,
  },
  sendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    padding: SPACING.md,
    borderRadius: 8,
  },
});

export default HelpSupportScreen;
