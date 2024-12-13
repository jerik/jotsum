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
