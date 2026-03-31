// async function fetchData() {
//   try {
//     const response = await fetch(
//       "https://data.lacity.org/resource/2nrs-mtv8.json"
//     );

//     if (!response.ok) {
//       throw new Error(`HTTP error: ${response.status}`);
//     }

//     const data = await response.json();

//     console.log("Fetched Data:", data);
//     return data;

//   } catch (error) {
//     console.error("Error fetching data:", error);
//   }
// }

// fetchData();


async function fetchData() {
  try {
    const response = await fetch(
      "https://data.lacity.org/resource/2nrs-mtv8.json?$limit=500"
    );

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }

    const data = await response.json();
    console.log(data);
    

    displayData(data); // send data to HTML
  } catch (error) {
    console.error("Error fetching data:", error);
  }
}

function displayData(data) {
  const tableBody = document.querySelector("#dataTable tbody");

  data.forEach(item => {
    const row = document.createElement("tr");

    row.innerHTML = `
      <td>${item.dr_no || "N/A"}</td>
      <td>${item.date_occ || "N/A"}</td>
      <td>${item.area_name || "N/A"}</td>
      <td>${item.vict_sex || "N/A"}</td>
      <td>${item.vict_age || "N/A"}</td>
      <td>${item.weapon_desc || "N/A"}</td>
    `;

    tableBody.appendChild(row);
  });
}

fetchData();
alert("hey")