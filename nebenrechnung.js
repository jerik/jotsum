/** Add a new calculation line **/
function add_calc_line() {
	const nr_line = document.createElement('nr-line');
	nr_line.setAttribute('contenteditable', 'true'); 
	const nr_sum = document.createElement('nr-sum');
	const nr_sheet = document.getElementById('sheet');
	console.log(nr_sheet);
	nr_sheet.appendChild(nr_line); 
	nr_sheet.appendChild(nr_sum); 
}

class Nebenrechnung {
	total; 

	constructor() {
		this.#get_sheet();
	}

	#get_sheet() {
		const sheet = document.querySelector('nr-sheet');

		Array.from(sheet.children).forEach((child, index) => {
			console.log(`Element ${index + 1}:`, child.tagName, child.textContent.trim());
			if (child.tagName == 'NR-LINE') {
				this.#read_line(); 
			} else if (child.tagName == 'NR-SUM') {
				console.log(child);
				this.#to_sum(child, index);
			}

	    });
	}

	#read_line() {
		console.log('readline');
	}
	#to_sum(tag, value) {
		tag.textContent = `New ${value + 1}`; 
		console.log(`to_sum: ${value + 1}`);
	}
}

window.onload = function () {
	const nr = new Nebenrechnung(); 
}
