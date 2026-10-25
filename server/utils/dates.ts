/** "Today" in India, as a DATE value (midnight UTC of the IST calendar day). */
export const todayIst = () => new Date(`${new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })}T00:00:00Z`);

export const parseDateOnly = (s: string) => new Date(`${s}T00:00:00Z`);
