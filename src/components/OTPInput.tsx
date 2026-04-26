import React, { useState, useRef, useEffect } from 'react';
import { View, StyleSheet, TextInput } from 'react-native';
import { COLORS, RADIUS, TYPOGRAPHY } from '../theme/theme';

interface OTPInputProps {
    length?: number;
    value?: string;
    onComplete: (code: string) => void;
}

export const OTPInput: React.FC<OTPInputProps> = ({ length = 6, value, onComplete }) => {
    const [otp, setOtp] = useState<string[]>(new Array(length).fill(''));
    const inputRefs = useRef<TextInput[]>([]);

    // Sync from external value (e.g. dev auto-fill)
    useEffect(() => {
        if (value && value.length === length) {
            const digits = value.split('');
            setOtp(digits);
            onComplete(value);
        }
    }, [value]);

    const handleChange = (text: string, index: number) => {
        const newOtp = [...otp];
        newOtp[index] = text;
        setOtp(newOtp);

        if (text.length !== 0 && index < length - 1) {
            inputRefs.current[index + 1].focus();
        }

        if (newOtp.every((val) => val !== '')) {
            onComplete(newOtp.join(''));
        }
    };

    const handleKeyPress = (e: any, index: number) => {
        if (e.nativeEvent.key === 'Backspace' && otp[index] === '' && index > 0) {
            inputRefs.current[index - 1].focus();
        }
    };

    return (
        <View style={styles.container}>
            {otp.map((digit, index) => (
                <TextInput
                    key={index}
                    ref={(ref) => { inputRefs.current[index] = ref as TextInput; }}
                    style={styles.input}
                    keyboardType="number-pad"
                    maxLength={1}
                    value={digit}
                    onChangeText={(text) => handleChange(text, index)}
                    onKeyPress={(e) => handleKeyPress(e, index)}
                    placeholder="·"
                    placeholderTextColor={COLORS.background.slate[400]}
                />
            ))}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        width: '100%',
        marginVertical: 20,
    },
    input: {
        width: 48,
        height: 56,
        borderBottomWidth: 2,
        borderBottomColor: COLORS.background.slate[200],
        textAlign: 'center',
        fontSize: 24,
        fontWeight: 'bold',
        color: COLORS.background.slate[900],
    },
});
