import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Picker } from "@react-native-picker/picker";

type Props = {
  value: string;
  onChange: (value: string) => void;
  error?: string;
};

export const categories = [
  "Road Damage",
  "Waste Management",
  "Water Supply",
  "Street Lights",
  "Public Safety",
  "Drainage Issue",
  "Traffic Signal Problem",
  "Illegal Dumping",
  "Sidewalk Damage",
];

export default function CategoryDropdown({ value, onChange, error }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>Category</Text>

      <View style={styles.pickerWrapper}>
        <Picker
          selectedValue={value}
          onValueChange={(itemValue) => onChange(itemValue)}
        >
          {categories.map((cat) => (
            <Picker.Item key={cat} label={cat} value={cat} />
          ))}
        </Picker>
      </View>

      {!!error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 16 },
  label: { fontWeight: "600", marginBottom: 6 },
  pickerWrapper: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    overflow: "hidden",
  },
  error: {
    color: "#d00",
    marginTop: 4,
    fontSize: 12,
  },
});
